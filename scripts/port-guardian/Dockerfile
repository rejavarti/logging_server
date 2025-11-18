# Port Guardian - dynamic port blocker/unblocker for Unraid host
FROM alpine:3.20
RUN apk add --no-cache bash jq iptables ip6tables
WORKDIR /app
COPY port-guardian.sh /app/port-guardian.sh
RUN chmod +x /app/port-guardian.sh
# Requires: --cap-add=NET_ADMIN and --network host
ENTRYPOINT ["/app/port-guardian.sh"]
