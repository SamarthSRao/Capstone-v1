FROM golang:1.24-alpine as builder

RUN apk add --no-cache protoc protobuf-dev git

RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.1
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1

WORKDIR /app
COPY . .
COPY protos/predictor.proto ./protos/

# Generate gRPC code
RUN mkdir -p protos/predictor
RUN protoc --proto_path=./protos --go_out=./protos/predictor --go_opt=paths=source_relative --go-grpc_out=./protos/predictor --go-grpc_opt=paths=source_relative ./protos/predictor.proto

RUN go mod init github.com/samarthsrao/capstone || true
RUN go mod tidy
RUN go build -o main ./main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
