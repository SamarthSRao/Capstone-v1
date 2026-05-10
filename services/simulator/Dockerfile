FROM golang:1.24-alpine as builder
WORKDIR /app
# COPY go.mod ./
COPY . .
RUN go build -o main ./main.go

FROM alpine:latest
WORKDIR /root/
COPY --from=builder /app/main .
CMD ["./main"]
