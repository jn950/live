import requests
import os
import re
import socket
import time
import sys
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

def log(msg):
    timestamp = datetime.now().strftime('%H:%M:%S')
    print(f"[{timestamp}] {msg}")
    sys.stdout.flush()

def get_response_time(ip_port):
    """测试 IP:PORT 的连通性并返回响应时间（秒）"""
    try:
        ip, port = ip_port.split(':')
        start_time = time.time()
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)  # 设置超时时间
        result = s.connect_ex((ip, int(port)))
        end_time = time.time()
        s.close()
        if result == 0:
            return end_time - start_time
        return None
    except:
        return None

def replace_id_in_line(line, new_id):
    """将行中的旧 ID 替换为新 ID (替换 http:// 和 /rtp 或 /udp 之间的内容)"""
    # 匹配 http://.../rtp 或 http://.../udp
    # 使用 \g<1> 语法避免与 new_id 中的数字混淆
    pattern = r'(http://)([^/]+)(/(?:rtp|udp)/)'
    replacement = rf'\g<1>{new_id}\g<3>'
    return re.sub(pattern, replacement, line)

def fetch_and_process():
    # 从环境变量读取 URL，如果不存在则使用默认值（本地测试用）
    url = os.environ.get('IP_SOURCE_URL', 'https://tv1288.xyz/ip.php')
    if not url:
        log("错误: 未设置 IP_SOURCE_URL 环境变量且没有默认值")
        return False
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    log("正在获取远程 IP 内容并进行测速...")
    
    max_retries = 3
    retry_delay = 5
    text = None
    
    for attempt in range(max_retries):
        try:
            log(f"尝试第 {attempt + 1} 次获取数据 (超时设置: 30s)...")
            response = requests.get(url, headers=headers, timeout=30, proxies={"http": None, "https": None})
            response.raise_for_status()
            text = response.text
            break # 成功获取，跳出循环
        except Exception as e:
            log(f"第 {attempt + 1} 次尝试失败: {e}")
            if attempt < max_retries - 1:
                log(f"等待 {retry_delay} 秒后重试...")
                time.sleep(retry_delay)
            else:
                log("已达到最大重试次数，获取数据失败。")
                return False

    if not text:
        return False
        
    try:
        lines = text.split('\n')
        isp_results = {}
        current_isp = None
        
        tasks = []
        with ThreadPoolExecutor(max_workers=20) as executor:
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # 如果是 IP:PORT 格式
                if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$', line):
                    if current_isp:
                        tasks.append((current_isp, line, executor.submit(get_response_time, line)))
                else:
                    # 假设非空且非 IP 的行是 ISP 名称
                    current_isp = line

        # 收集结果并按 ISP 分组
        isp_results = {}
        for isp, ip_port, future in tasks:
            resp_time = future.result()
            if resp_time is not None:
                if isp not in isp_results:
                    isp_results[isp] = []
                isp_results[isp].append({"ip_port": ip_port, "time": resp_time})
        
        # 内部排序：每个 ISP 下的 ID 按时间从快到慢排序
        for isp in isp_results:
            isp_results[isp].sort(key=lambda x: x["time"])
        
        # 外部排序：
        shanghai_key = "上海电信"
        shanghai_data = isp_results.get(shanghai_key, [])
        
        other_isps = [k for k in isp_results.keys() if k != shanghai_key]
        other_isps.sort(key=lambda k: isp_results[k][0]["time"])
        
        sorted_isp_list = []
        if shanghai_data:
            sorted_isp_list.append(shanghai_key)
        sorted_isp_list.extend(other_isps)

        # 1. 整合 pllive.txt
        pllive_file = os.path.join("tv", "pllive.txt")
        ptxt_dir = "template"
        all_pllive_content = []
        
        # 新的头部格式
        current_date = datetime.now().strftime('%Y-%m-%d')
        all_pllive_content.append("MoMo更新,#genre#")
        all_pllive_content.append(f"{current_date},https://my9.ltd/momo-480.mp4")
        all_pllive_content.append("") # 头部后空行

        log(f"开始整合 pllive.txt, 目录: {ptxt_dir}")
        
        for isp in sorted_isp_list:
            json_filename = f"{isp}.json"
            json_path = os.path.join(ptxt_dir, json_filename)
            
            if os.path.exists(json_path):
                log(f"正在处理 {isp} 的整合...")
                # 取前两名 ID
                top_ids = [item['ip_port'] for item in isp_results[isp][:2]]
                
                with open(json_path, "r", encoding="utf-8") as jf:
                    json_lines = jf.readlines()
                
                # 为每个 top_id 生成一份完整的列表
                for i, top_id in enumerate(top_ids):
                    for line_idx, line in enumerate(json_lines):
                        line = line.strip()
                        if not line: continue
                        
                        if line_idx == 0:
                            # 只有第一个 ID 组才添加 ISP 组名标头
                            if i == 0:
                                all_pllive_content.append(line)
                        else:
                            replaced_line = replace_id_in_line(line, top_id)
                            all_pllive_content.append(replaced_line)
                    all_pllive_content.append("") # 组间空行
            else:
                log(f"  警告: 找不到对应的 JSON 文件: {json_path}")

        final_output = "\n".join(all_pllive_content)
        with open(pllive_file, "w", encoding="utf-8") as pf:
            pf.write(final_output)
            
        log(f"整合文件已成功保存到 {pllive_file}")
        
        return True
        
    except Exception as e:
        log(f"处理失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    fetch_and_process()
