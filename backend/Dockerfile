FROM tensorflow/tensorflow:2.14.0

WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn[standard] tensorflow-hub Pillow boto3 psutil python-multipart

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]