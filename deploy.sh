#!/bin/bash

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
else
  echo "❌ Error: .env file not found. Please create one from .env.example"
  exit 1
fi

DOMAIN=$DOMAIN
EMAIL=$EMAIL

echo "-----------------------------------------------------------------------"
echo "🚀 QuizMaster Production Deployment Script"
echo "-----------------------------------------------------------------------"
echo "Target Domain: $DOMAIN"
echo "Admin Email:   $EMAIL"
echo "-----------------------------------------------------------------------"

# 1. Mongo Keyfile Setup
echo "🔐 Setting up MongoDB Keyfile authentication..."
if [ ! -f mongo-keyfile ]; then
    openssl rand -base64 756 > mongo-keyfile
    echo "   ✅ Generated new mongo-keyfile"
else
    echo "   ℹ️  Using existing mongo-keyfile"
fi

# Set crucial permissions for Mongo (Must be 400 and owned by 999:999)
chmod 400 mongo-keyfile
chown 999:999 mongo-keyfile 2>/dev/null || echo "   ⚠️  Warning: Could not chown mongo-keyfile to 999:999. Can be ignored if users are mapped automatically or running on Windows."
echo "   ✅ Permissions set to 400"

# 2. SSL Certificate Setup (Let's Encrypt)
echo "-----------------------------------------------------------------------"
echo "🔒 Checking SSL Configuration..."

if ! [ -x "$(command -v docker-compose)" ]; then
  echo '❌ Error: docker-compose is not installed.' >&2
  exit 1
fi

data_path="./certbot"

if [ -d "$data_path/conf/live/$DOMAIN" ]; then
    echo "   ✅ SSL Certificate already exists for $DOMAIN"
else
    echo "   📜 Starting SSL Certificate Acquisition for $DOMAIN..."
    
    # Download recommended TLS parameters
    if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
        echo "   📥 Downloading TLS parameters..."
        mkdir -p "$data_path/conf"
        curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
        curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
    fi

    # Create dummy certificate
    echo "   🔑 Creating dummy certificate..."
    path="/etc/letsencrypt/live/$DOMAIN"
    mkdir -p "$data_path/conf/live/$DOMAIN"
    docker-compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:4096 -days 1\
        -keyout '$path/privkey.pem' \
        -out '$path/fullchain.pem' \
        -subj '/CN=localhost'" certbot > /dev/null 2>&1

    # Start Nginx
    echo "   🚀 Starting Nginx..."
    docker-compose up -d nginx > /dev/null 2>&1

    # Delete dummy certificate
    echo "   🗑️  Removing dummy certificate..."
    docker-compose run --rm --entrypoint "\
    rm -Rf /etc/letsencrypt/live/$DOMAIN && \
    rm -Rf /etc/letsencrypt/archive/$DOMAIN && \
    rm -Rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot > /dev/null 2>&1

    # Request real certificate
    echo "   🌐 Requesting Let's Encrypt certificate..."
    docker-compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
        --email $EMAIL \
        -d $DOMAIN -d www.$DOMAIN \
        --rsa-key-size 4096 \
        --agree-tos \
        --force-renewal \
        --non-interactive" certbot

    echo "   🔄 Reloading Nginx..."
    docker-compose exec nginx nginx -s reload
fi

echo "-----------------------------------------------------------------------"
echo "✅ Deployment Preparation Complete."
echo "-----------------------------------------------------------------------"
echo "To start the application, run:"
echo "   docker-compose up -d --build"
echo "-----------------------------------------------------------------------"
