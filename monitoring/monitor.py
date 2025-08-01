import time
import psutil

def log_metrics():
    while True:
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=1)
        print(f"CPU: {cpu}%, Memory: {mem.percent}%")
        time.sleep(5)

if __name__ == "__main__":
    log_metrics()
