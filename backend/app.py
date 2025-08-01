import os
import time
import json
from typing import Dict, Any

import boto3
import psutil
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from movenet_utils import run_inference, store_result

APP_NAME = "MoveNet Backend"
ENV = os.getenv("ENV", "prod")
ALLOW_CLOUDWATCH = os.getenv("ALLOW_CLOUDWATCH", "false").lower() == "true"
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

app = FastAPI(title=APP_NAME, version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cw = None
def cw():
    global _cw
    if _cw is None:
        _cw = boto3.client("cloudwatch")
    return _cw

@app.get("/healthz")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "env": ENV}

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    variant: str = Query("singlepose_lightning", regex="^(singlepose_lightning|singlepose_thunder|multipose_lightning)$"),
    store: bool = Query(False)
):
    start = time.time()
    image_bytes = await file.read()
    result = run_inference(image_bytes, variant=variant)

    try:
        result["host"] = {
            "cpu_pct": psutil.cpu_percent(interval=None),
            "mem_pct": psutil.virtual_memory().percent
        }
    except Exception:
        pass

    duration_ms = (time.time() - start) * 1000.0
    result["inference_time_ms_total"] = round(duration_ms, 2)

    if ALLOW_CLOUDWATCH:
        try:
            cw().put_metric_data(
                Namespace="MoveNetService",
                MetricData=[
                    {"MetricName": "LatencyMs", "Value": duration_ms, "Unit": "Milliseconds",
                     "Dimensions": [{"Name": "Route", "Value": "/predict"}, {"Name": "Env", "Value": ENV}]}
                ],
            )
        except Exception:
            pass

    if store:
        try:
            key = store_result(result)
            result["stored_at"] = key
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": f"store_failed: {e}"})
    return result

@app.post("/store")
async def store(payload: Dict[str, Any]):
    try:
        key = store_result(payload)
        return {"stored_at": key}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"store_failed: {e}"})