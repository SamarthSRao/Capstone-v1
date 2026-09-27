FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY main.go .
RUN go mod init target-app && CGO_ENABLED=0 GOOS=linux go build -o target-app main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/target-app .
EXPOSE 8080
CMD ["./target-app"]
