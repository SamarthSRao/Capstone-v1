FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple

COPY . .

# MODEL_DIR in the cluster is /app/models/nasa. COPY . . already includes
# this file; the explicit copy makes the image build fail if the NASA
# directory is missing the trained RL checkpoint.
COPY models/nasa/rl_agent_checkpoint.pth /app/models/nasa/rl_agent_checkpoint.pth

# Generate gRPC code
RUN python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. ./predictor.proto

CMD ["python", "-u", "server.py"]
