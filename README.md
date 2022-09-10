# namesilo-ddns

A simple namesilo ddns script which update your namesilo domans to local ip address automatically.

## Configuration

`ddns.js` reads configuration from `config.json`. You should modify `config.json` before running.

Configration sample:

```json
 {
   "hosts": [
    "rss.otherdomain.com",
    "books.mydomain.com",
    "monitor.mydomain.com"
  ],
  "namesilo_key": "./secrets/namesilo_key",
  "retries": 20,
  "notify": true,
  "email_host": "smtp.qq.com",
  "email_port": 465,
  "email_from": "xxxx@qq.com",
  "email_to": "xxxx@outlook.com",
  "email_secure": true,
  "email_password": "./secrets/email_password"
}
```

Configuration files:

| Field          | Sample                                    | Description                                                  |
|:--------------:|:-----------------------------------------:|:------------------------------------------------------------:|
| hosts          | Sub-domains should be updated             | A list of sub-domains. Domain is not supported               |
| namesilo_key   | "./secrets/namesilo_key"                  | Your Namesilo token                                          |
| retires        | 20                                        | For some reasons, it is pro                                  |
| notify         | true                                      | Enable email notify whether or not                           |
| emal_host      | "smtp.qq.com"                             | Your SMTP email server host                                  |
| email_port     | 465                                       | Your SMTP email server port                                  |
| email_from     | "somebody@gmail.com"                      | Your email address                                           |
| email_to       | "receiver1@gmail.com,receiver2@gmail.com" | A list of receiver email addresses writen in a single string |
| email_secure   | true                                      | Enable TLS or not                                            |
| email_password | "./secrets/email_password"                | Your email password or token                                 |

## Secret

All secrets are stored in file. You should write your email password into file `email_password`, namesilo key into `namesilo_key`.

## Run

```shell
git clone https://github.com/kongjun18/namesilo-ddns.githttps://github.com/kongjun18/namesilo-ddns.git
cd namesilo-ddns
# Configure your config.json and secrets/
npm install # install dependencies(only two packages)
node ddns.js
```

## Docker

```shell
mkdir secrets
# echo "xxxxx" > secrets/email_password
# echo "xxxxx" > secrets/namesilo_key
# Configure your config.json
docker run --network=host --rm -v $(pwd)/secrets:/app/secrets -v $(pwd)/config.json:/app/config.json kongjun18/namesilo-ddns:latest
```

## Timer

Using systemd timer to run this script periodically.

### Nodejs

systemd service file: usr/lib/systemd/system/ddns.service

```
[Unit]
Description=Updates your domain address

[Service]
ExecStart=/usr/bin/node /root/namesilo-ddns/ddns.js
WorkingDirectory=/root/namesilo-ddns
```
**NOTE**: `WorkingDirectory` is the path of the repo

system timer file: usr/lib/systemd/system/ddns.timer
```
[Unit]
Description=Runs namesilo-ddns per hour or reboot

[Timer]
OnUnitActiveSec=1h
OnStartupSec=60s
Unit=ddns.service

[Install]
WantedBy=multi-user.target
```

### Docker

systemd service file: usr/lib/systemd/system/ddns.service

```
[Unit]
Description=Update domain IP address

[Service]
ExecStart=/usr/bin/docker run --network=host --rm -v <your-path-to-secrets>:/app/secrets -v <your-path-to-config.json>:/app/config.json kongjun18/namesilo-ddns:latest
```

system timer file: usr/lib/systemd/system/ddns.timer

```
[Unit]
Description=Runs namesilo-ddns per hour or after boot

[Timer]
OnUnitActiveSec=1h
OnStartupSec=60s
Unit=ddns.service

[Install]
WantedBy=multi-user.target
```
