FROM golang:1.21-alpine as builder

RUN apk add --no-cache protoc protobuf-dev git

RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

WORKDIR /app
COPY . .
COPY ../../protos/predictor.proto ./protos/

# Generate gRPC code
RUN mkdir -p protos/predictor
RUN protoc --proto_path=./protos --go_out=. --go-grpc_out=. ./protos/predictor.proto

RUN go mod init github.com/samarthsrao/capstone || true
RUN go mod tidy
RUN go build -o main ./main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
