import tensorflow as tf
import numpy as np
import io
from PIL import Image
import time

model = tf.saved_model.load("https://tfhub.dev/google/movenet/singlepose/lightning/4")

def preprocess_image(image_bytes):
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize((192, 192))
    return tf.expand_dims(tf.convert_to_tensor(np.array(image), dtype=tf.int32), axis=0)

def run_inference(image_bytes):
    start = time.time()
    input_tensor = preprocess_image(image_bytes)
    outputs = model.signatures["serving_default"](input_tensor)
    inference_time = time.time() - start
    keypoints = outputs["output_0"].numpy().tolist()
    return {
        "keypoints": keypoints,
        "inference_time_sec": round(inference_time, 3)
    }
