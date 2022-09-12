const https = require('https')
const xml2js = require('xml2js')
const nodemailer = require('nodemailer')
const fs = require('fs')

const debug = false

function getLocalIp() {
    if (typeof getLocalIp.ip !== 'undefined') {
        return getLocalIp.ip
    }

    const {
        networkInterfaces
    } = require('os')

    const nets = networkInterfaces()
    const results = {}

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = []
                }
                results[name].push(net.address)
            }
        }
    }
    console.log(`Network interfaces: ${JSON.stringify(results)}`)
    for (const netcard of Object.keys(results)) {
        getLocalIp.ip = results[netcard].toString()
        return getLocalIp.ip
    }
    throw "There is no available network interface."
}

async function GetDDNSRecords(hosts, domains, key) {
    const promises = []
    for (const domain of domains) {
        promises.push(getDDNSRecords(hosts, domain, key))
    }
    try {
        ddnsRecords = await Promise.all(promises)
        const res = []
        for (const record of ddnsRecords) {
            res.push(...record)
        }
        return res
    } catch (error) {
        return error
    }
}

function getDDNSRecords(hosts, domain, key) {
    return new Promise((resolve, reject) => {
        https.get(`https://www.namesilo.com/api/dnsListRecords?version=1&type=xml&key=${key}&domain=${domain}`, function(res) {
            let xmlData = ''
            res.on('data', (stream) => {
                xmlData = xmlData + stream
            })
            res.on('end', () => {
                const parser = new xml2js.Parser()
                parser.parseString(xmlData, (error, result) => {
                    if (error === null) {
                        // console.log(JSON.stringify(result, null, 4))
                        let reply = result.namesilo.reply[0]
                        if (reply.code != "300") {
                            reject(`Fail to list domain ${domain}`)
                            return
                        }
                        const ddnsRecords = []
                        for (const record of reply.resource_record) {
                            if (record.type[0] === "A") {
                                if (hosts.indexOf(record.host[0]) > -1) {
                                    ddnsRecords.push({
                                        rrid: record.record_id,
                                        rrhost: parseRrhost(record.host[0]),
                                        domain: parseDomain(record.host[0]),
                                        rrvalue: getLocalIp(),
                                        oldip: record.value[0],
                                        updated: false,
                                    })
                                }
                            }
                        }
                        resolve(ddnsRecords)
                    }
                    else {
                        reject(error)
                    }
                })
            })
        }).on('error', (error) => reject(error))
    })
}

function updateHost(record, key) {
    return new Promise((resolve, reject) => {
        console.log(`${typeof getLocalIp()}`)
        if (record.updated || record.oldip === getLocalIp()) {
            record.updated = true
            resolve()
            return
        }
        https.get(`https://www.namesilo.com/api/dnsUpdateRecord?version=1&type=xml&key=${key}&domain=${record.domain}&rrid=${record.rrid}&rrhost=${record.rrhost}&rrvalue=${record.rrvalue}&rrttl=7207`, function(res) {
            let xml_data = ''
            res.on('data', (stream) => {
                xml_data = xml_data + stream
            })
            res.on('end', () => {
                const parser = new xml2js.Parser()
                parser.parseString(xml_data, (error, result) => {
                    if (error !== null) {
                        reject(error)
                        return
                    }
                    if (result !== undefined && result.namesilo !== undefined) {
                        const httpCode = result.namesilo.reply[0].code[0]
                        if (httpCode != '300') {
                            reject(`Record ${JSON.stringify(record)} fails! http code: ${httpCode}`)
                            return
                        }
                        newUpdate = true
                        console.log(`${record.rrhost}.${record.domain} ip address is updated!`)
                        record.updated = true
                        resolve()
                    }
                })
            })
        }).on('error', (error) => reject(error))
    })
}

// Namesilo seems to limit api request rate.
// If encounter error, request later again.
async function UpdateHost(records, key, retries) {
    let stop = false
    let i = 0
    if (retries === undefined) {
        retries = 20
    }
    while (!stop && i < retries) {
        stop = true
        ++i
        const promises = []
        for (const record of records) {
            if (!record.updated) {
                stop = false
                promises.push(updateHost(record, key))
            }
        }

        // NOTE: wait all promises fail or finish
        Promise.all(promises.map(p => p.catch(_ => { })))
            .then(_ => { })
            .catch(err => { if (debug) { console.error(err) } });
        // console.info(JSON.stringify(records))
        console.log(`retries ${i} times...`)
        await sleep(500 + i * 500)
    }
    return records
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function SendMail(records, host, port, secure, from, pass, to) {
    let transporter = nodemailer.createTransport({
        "host": host,
        "port": port,
        "secureConnection": secure,
        "auth": {
            "user": from,
            "pass": pass,
        }
    });
    let mailOptions = {
        from: from,
        to: to,
        subject: 'DDNS Notification',
        text: DNSUpdateResult(records),
    };
    return transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            return console.log(error);
        }
        console.log('Message sent: ' + info.response);
    });
}

function DNSUpdateResult(records) {
    const text = []
    for (const record of records) {
        if (!record.updated) {
            text.push(`${record.rrhost}.${record.domain}: failed.`)
        } else {
            text.push(`${record.rrhost}.${record.domain}: ${record.oldip} ==> ${record.rrvalue}`)
        }
    }
    return text.join('\n')
}

function parseDomain(host) {
    const parts = host.split('.')
    return parts.slice(-2).join('.')
}

function parseRrhost(host) {
    const parts = host.split('.')
    return parts.length === 3 ? parts[0] : ''
}

function getDomains(hosts) {
    let domains = new Set()
    for (const host of hosts) {
        domains.add(parseDomain(host))
    }
    return domains
}

function readSecret(file) {
    return fs.readFileSync(file, { encoding: 'utf8', flag: 'r' }).trim()
}

function parseConfig() {
    const config = require("./config.json")
    config.domains = getDomains(config.hosts)
    config.namesilo_key = readSecret(config.namesilo_key)
    config.email_password = readSecret(config.email_password)
    return config
}

(async () => {
    const config = parseConfig()
    console.log("==========Configuration==========")
    console.log(config)
    const records = await GetDDNSRecords(config.hosts, config.domains, config.namesilo_key)
    console.log("==========DDNS Records==========")
    console.log(records)
    console.log("==========Updating Domains==========")
    await UpdateHost(records, config.namesilo_key, config.retries)
    console.log("==========DDNS Update Results==========")
    console.info(DNSUpdateResult(records))
    console.log(`==========Sending email==========`)
    if (config.notify && typeof newUpdate !== 'undefined') {
        console.log(`Send email to ${config.email_to}`)
        SendMail(records, config.email_host, config.email_port, config.email_secure, config.email_from, config.email_password, config.email_to)
    } else {
        console.log(`Domain IP address unchanges!`)
    }
})()
