import os
import io
import time
import json
from datetime import datetime
from typing import Dict, Any, Tuple

import numpy as np
from PIL import Image
import tensorflow as tf
import tensorflow_hub as hub
import boto3

VARIANT_TO_HUB = {
    "singlepose_lightning": "https://tfhub.dev/google/movenet/singlepose/lightning/4",
    "singlepose_thunder":   "https://tfhub.dev/google/movenet/singlepose/thunder/4",
    "multipose_lightning":  "https://tfhub.dev/google/movenet/multipose/lightning/1",
}

VARIANT_INPUT = {
    "singlepose_lightning": (192, 192),
    "singlepose_thunder":   (256, 256),
    "multipose_lightning":  (256, 256),
}

_LOADED: Dict[str, Any] = {}

def _load_model(variant: str):
    if variant not in _LOADED:
        handle = VARIANT_TO_HUB[variant]
        _LOADED[variant] = hub.load(handle)
    return _LOADED[variant]

def _preprocess(image_bytes: bytes, size: Tuple[int,int]) -> tf.Tensor:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(size)
    arr = np.array(img)
    tensor = tf.convert_to_tensor(arr)
    tensor = tf.expand_dims(tensor, axis=0)
    tensor = tf.cast(tensor, dtype=tf.int32)
    return tensor

def _decode_singlepose(output) -> Any:
    kp = tf.squeeze(output["output_0"], axis=1).numpy().tolist()
    return {"keypoints": kp}

def _decode_multipose(output) -> Any:
    arr = output["output_0"].numpy()
    return {"raw_output_0": arr.tolist(), "raw_shape": list(arr.shape)}

def run_inference(image_bytes: bytes, variant: str = "singlepose_lightning") -> Dict[str, Any]:
    model = _load_model(variant)
    size = VARIANT_INPUT[variant]
    input_tensor = _preprocess(image_bytes, size=size)

    start = time.time()
    outputs = model.signatures["serving_default"](input_tensor)
    inf_ms = (time.time() - start) * 1000.0

    if variant.startswith("singlepose"):
        decoded = _decode_singlepose(outputs)
    else:
        decoded = _decode_multipose(outputs)

    decoded.update({
        "model_variant": variant,
        "model_handle": VARIANT_TO_HUB[variant],
        "inference_time_ms_model": round(inf_ms, 2),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
    return decoded

STORE_BACKEND = os.getenv("STORE_BACKEND", "local")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "results/")

def _local_store(obj: Dict[str, Any]) -> str:
    os.makedirs("data", exist_ok=True)
    dt = datetime.utcnow().strftime("%Y-%m-%d/%H")
    pathdir = os.path.join("data", dt)
    os.makedirs(pathdir, exist_ok=True)
    fname = datetime.utcnow().strftime("%Y%m%dT%H%M%S%fZ") + ".json"
    path = os.path.join(pathdir, fname)
    with open(path, "w") as f:
        json.dump(obj, f)
    return path

def _s3_store(obj: Dict[str, Any]) -> str:
    s3 = boto3.client("s3")
    dt = datetime.utcnow().strftime("date=%Y-%m-%d/hour=%H")
    key = f"{S3_PREFIX}{dt}/{datetime.utcnow().strftime('%Y%m%dT%H%M%S%fZ')}.json"
    s3.put_object(Bucket=S3_BUCKET, Key=key, Body=json.dumps(obj).encode("utf-8"), ContentType="application/json")
    return f"s3://{S3_BUCKET}/{key}"

def store_result(obj: Dict[str, Any]) -> str:
    if STORE_BACKEND == "s3":
        return _s3_store(obj)
    return _local_store(obj)