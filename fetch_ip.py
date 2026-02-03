import requests
import os
import re
import socket
import time
import sys
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

def log(msg):
    # 获取北京时间 (UTC+8)
    beijing_time = datetime.now(timezone.utc) + timedelta(hours=8)
    timestamp = beijing_time.strftime('%H:%M:%S')
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
    # 从环境变量读取 URL，确保不泄露硬编码地址
    url = os.environ.get('IP_SOURCE_URL')
    if not url:
        log("错误: 未设置 IP_SOURCE_URL 环境变量")
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
            log(f"尝试第 {attempt + 1} 次获取数据 (超时设置: 50s)...")
            response = requests.get(url, headers=headers, timeout=50, proxies={"http": None, "https": None})
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
        
        # 新的头部格式：显式使用北京时间 (UTC+8)
        beijing_now = datetime.now(timezone.utc) + timedelta(hours=8)
        current_date = beijing_now.strftime('%Y-%m-%d %H:%M:%S')
        
        header_content = []
        header_content.append("MoMo更新,#genre#")
        header_content.append(f"{current_date},https://my9.ltd/momo-480.mp4")
        header_content.append("安徽黄山风景区卧云峰,https://gctxyc.liveplay.myqcloud.com/gc/wgw02_1/index.m3u8")
        header_content.append("安徽黄山风景区飞来石,https://gctxyc.liveplay.myqcloud.com/gc/hsptgy_1/index.m3u8")
        header_content.append("江苏南京玄武湖景区,https://gctxyc.liveplay.myqcloud.com/gc/xwh01_1/index.m3u8")
        header_content.append("江苏徐州之夜,https://gctxyc.liveplay.myqcloud.com/gc/hspyt_1/index.m3u8")
        header_content.append("浙江嘉兴乌镇,https://gctxyc.liveplay.myqcloud.com/gc/zjwzblt_1/index.m3u8")
        header_content.append("浙江舟山东极岛,https://gcalic.v.myalicdn.com/gc/djd01_1/index.m3u8")
        header_content.append("浙江温州廊桥文化园,https://gcalic.v.myalicdn.com/gc/cntv411-zbzg_1/index.m3u8")
        header_content.append("浙江嵊泗县中心渔港,https://gctxyc.liveplay.myqcloud.com/gc/emsyh_1/index.m3u8")
        header_content.append("广东车八岭自然保护区,https://gctxyc.liveplay.myqcloud.com/gc/zjjjjdl_1/index.m3u8")
        header_content.append("广东汕头公园,https://gctxyc.liveplay.myqcloud.com/gc/bsszjs_1/index.m3u8")
        header_content.append("山东青岛艾山天文台,https://gcalic.v.myalicdn.com/gc/jhs01_1/index.m3u8")
        header_content.append("湖北武汉黄鹤楼,https://gctxyc.liveplay.myqcloud.com/gc/djyqyl1_1/index.m3u8")
        header_content.append("湖南邵阳崀山名胜区,https://gctxyc.liveplay.myqcloud.com/gc/hkts02_1/index.m3u8")
        
        # 准备频道内容
        isp_processed_content = {} # 存储每个 ISP 处理后的频道行
        all_4k_channels = [] # 存储所有提取出来的 4K 频道
        
        log(f"开始处理频道数据并提取 4K 频道...")
        
        for isp in sorted_isp_list:
            json_filename = f"{isp}.json"
            json_path = os.path.join(ptxt_dir, json_filename)
            
            if os.path.exists(json_path):
                isp_channels = []
                # 取前两名 ID
                top_ids = [item['ip_port'] for item in isp_results[isp][:2]]
                
                with open(json_path, "r", encoding="utf-8") as jf:
                    json_lines = jf.readlines()
                
                for i, top_id in enumerate(top_ids):
                    for line_idx, line in enumerate(json_lines):
                        line = line.strip()
                        if not line: continue
                        
                        if line_idx == 0:
                            # 组名行，记录一下但不直接添加
                            genre_header = line
                            continue
                        
                        replaced_line = replace_id_in_line(line, top_id)
                        # 检查是否含有 "4K"
                        if "4K" in replaced_line.upper(): # 不区分大小写
                            # 如果是 4K 频道，添加到全局 4K 列表
                            all_4k_channels.append(replaced_line)
                        else:
                            # 普通频道，保留在原 ISP 列表中
                            isp_channels.append(replaced_line)
                    
                    if i < len(top_ids) - 1 and isp_channels:
                        isp_channels.append("") # 两个 ID 之间的空行
                
                if isp_channels:
                    # 只有当有普通频道时，才添加 ISP 头部和频道内容
                    isp_processed_content[isp] = [genre_header] + isp_channels + [""]
            else:
                log(f"  警告: 找不到对应的 JSON 文件: {json_path}")

        # 组装最终文件内容
        final_content = []
        final_content.extend(header_content)
        
        # 将 4K 频道移动到 MoMo 更新下面
        if all_4k_channels:
            # 添加 4K 频道专属分类
            final_content.append("4K频道,#genre#")
            # 去重处理（相同内容的 4K 频道只保留一个，但保留顺序）
            seen_4k = set()
            unique_4k = []
            for ch in all_4k_channels:
                if ch not in seen_4k:
                    unique_4k.append(ch)
                    seen_4k.add(ch)
            final_content.extend(unique_4k)
            final_content.append("") # 4K 频道后的空行
        
        # 添加各个 ISP 的剩余频道
        for isp in sorted_isp_list:
            if isp in isp_processed_content:
                final_content.extend(isp_processed_content[isp])

        log(f"开始写入 pllive.txt...")
        with open(pllive_file, "w", encoding="utf-8") as pf:
            pf.write("\n".join(final_content))
            
        log(f"整合文件已成功保存到 {pllive_file}，已将所有 4K 频道置顶。")
        
        return True
        
    except Exception as e:
        log(f"处理失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    fetch_and_process()
