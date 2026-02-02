import requests
import os
import time
from datetime import datetime
from urllib.parse import urlparse

def validate_content(content):
    """
    严格校验内容是否为有效的直播源，而非 WAF 拦截页面
    """
    if not content or len(content) < 500:
        return False, "内容太短，可能下载失败"
    
    # WAF 拦截页面常见关键词
    waf_keywords = ["WAF", "安全防护", "机房IP", "黑名单", "访问被拒绝", "DOCTYPE html"]
    for word in waf_keywords:
        if word in content:
            return False, f"检测到 WAF 拦截标识: {word}"
    
    # 直播源特征关键词
    source_features = ["#genre#", "http://", "https://", "rtp://", "#EXTM3U", "CCTV"]
    feature_count = sum(1 for feature in source_features if feature in content)
    
    if feature_count >= 1:
        return True, "验证通过"
    else:
        return False, "未检测到直播源特征内容"

def sync_tv_source():
    # 从环境变量读取源地址，如果未设置则报错，不再硬编码
    url = os.environ.get("TV_SOURCE_URL")
    if not url:
        print("‼️ 错误: 未配置 TV_SOURCE_URL 环境变量")
        return False
        
    local_path = "tv/pllive.txt"
    max_retries = 3
    
    # 动态解析 Referer，避免硬编码
    parsed_url = urlparse(url)
    base_url = f"{parsed_url.scheme}://{parsed_url.netloc}/"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/plain, */*",
        "Referer": base_url
    }
    
    # 从环境变量读取代理设置 (GitHub Secrets)
    proxy_url = os.environ.get("DOMESTIC_PROXY")
    proxies = {
        "http": proxy_url,
        "https": proxy_url
    } if proxy_url else None

    print(f"[{datetime.now()}] 开始同步直播源: {url}")
    if proxy_url:
        print(f"使用代理: {proxy_url[:10]}***")
    else:
        print("未配置代理，尝试直接连接...")

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(url, headers=headers, proxies=proxies, timeout=30)
            response.raise_for_status()
            
            content = response.text
            is_valid, message = validate_content(content)
            
            if is_valid:
                os.makedirs(os.path.dirname(local_path), exist_ok=True)
                with open(local_path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"✅ 同步成功！文件已保存至 {local_path} (大小: {len(content)} 字节)")
                return True
            else:
                print(f"⚠️ 第 {attempt} 次尝试验证失败: {message}")
                
        except Exception as e:
            print(f"❌ 第 {attempt} 次请求异常: {e}")
        
        if attempt < max_retries:
            wait_time = attempt * 5
            print(f"等待 {wait_time} 秒后重试...")
            time.sleep(wait_time)
            
    print("‼️ 所有重试均已失败，同步中止。")
    return False

if __name__ == "__main__":
    sync_tv_source()
