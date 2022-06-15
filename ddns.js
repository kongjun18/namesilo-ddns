const https = require('https')
const xml2js = require('xml2js')
const util = require('util')
const nodemailer = require('nodemailer')

const parser = new xml2js.Parser()

const RETRIES = 30


// TODO: parse from json configuration
const NAMESILO_KEY = 'a1aa9ba96998f9fef9e46'
// FIXME: don't support domain.
const hosts = [ ]
const domains = [] // TODO: extract fron hosts
const host = 'smtp.qq.com'
const port = 465
const secure = true
const from = 'xxx@qq.com'
const pass = 'xxxxxx'
const to = 'xxxxxxx@outlook.com' // A list of receviers
const CurrentIP = "xxxxx" // TODO


async function GetDDNSRecords(domains, key) {
    const promises = []
    for (const domain of domains) {
        promises.push(getDDNSRecords(domain, key))
    }
    try {
        ddnsRecords = await Promise.all(promises)
        const res = []
        for (const record of ddnsRecords) {
            res.push(...record)
        }
        return res
    } catch (error) {
        // console.log(error)
        return error
    }
}

function getDDNSRecords(domain, key) {
    return new Promise((resolve, reject) => {
        https.get(`https://www.namesilo.com/api/dnsListRecords?version=1&type=xml&key=${key}&domain=${domain}`, function(res) {
            let xml_data = ''
            res.on('data', (stream) => {
                xml_data = xml_data + stream
            })
            res.on('end', () => {
                parser.parseString(xml_data, (error, result) => {
                    if (error === null) {
                        // console.log(JSON.stringify(result, null, 4))
                        let reply = result.namesilo.reply[0]
                        if (reply.code != "300") {
                            reject(`Fail to list domain ${domain}`)
                        }
                        const ddnsRecords = []
                        for (const record of reply.resource_record) {
                            if (record.type[0] === "A") {
                                if (hosts.indexOf(record.host[0]) > -1) {
                                    ddnsRecords.push({
                                        rrid: record.record_id,
                                        rrhost: parseRrhost(record.host[0]),
                                        domain: parseDomain(record.host[0]),
                                        rrvalue: CurrentIP,
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
        https.get(`https://www.namesilo.com/api/dnsUpdateRecord?version=1&type=xml&key=${key}&domain=${record.domain}&rrid=${record.rrid}&rrhost=${record.rrhost}&rrvalue=${record.rrvalue}&rrttl=7207`, function(res) {
            let xml_data = ''
            res.on('data', (stream) => {
                xml_data = xml_data + stream
            })
            res.on('end', () => {
                parser.parseString(xml_data, (error, result) => {
                    if (error !== null) {
                        reject(error)
                    }
                    if (result !== null && result !== undefined && result.namesilo !== undefined) {
                        httpCode = result.namesilo.reply[0].code[0]
                        if (httpCode != '300') {
                            console.error(`${JSON.stringify(record)} http code: ${httpCode}`)
                            reject(`${JSON.stringify(record)} http code: ${httpCode}`)
                        }
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
async function UpdateHost(records, key) {
    let stop = false
    let retries = 0
    while (!stop && retries < RETRIES) {
        stop = true
        ++retries
        const promises = []
        for (const record of records) {
            if (!record.updated) {
                stop = false
                promises.push(updateHost(record, key))
            }
        }

        // NOTE: wait all promises fail or finish
        Promise.all(promises.map(p => p.catch(e => { })))
            .then(_ => { })
            .catch(_ => { });
        // console.info(JSON.stringify(records))
        console.log(`retries ${retries} times...`)
        await sleep(500 + retries * 500)
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

(async () => {
    const records = await GetDDNSRecords(domains, NAMESILO_KEY)
    await UpdateHost(records, NAMESILO_KEY)
    console.info(DNSUpdateResult(records))
    // SendMail(records, host, port, secure, from, pass, to)
})()
