from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from movenet_utils import run_inference
import uvicorn

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    image_bytes = await file.read()
    result = run_inference(image_bytes)
    return result

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000)
