#!/bin/bash

apt-get update
apt-get install -y curl

# install docker
curl -fsSL https://get.docker.com | sh
# pull vbrowser image
docker pull m1k1o/neko:chromium
# install certbot
DEBIAN_FRONTEND=noninteractive apt-get install -y certbot
certbot certonly --standalone -n --email admin@webcinetv.com.br --agree-tos -d docker1.webcinetv.com.br
chmod -R 755 /etc/letsencrypt/live/
chmod -R 755 /etc/letsencrypt/archive/
