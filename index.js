'use strict';
const {promisify} = require('util');
const dns = require('dns');
const net = require('net');
const arrify = require('arrify');
const got = require('got');
const isPortReachable = require('is-port-reachable');
const pAny = require('p-any');
const pTimeout = require('p-timeout');
const prependHttp = require('prepend-http');
const routerIps = require('router-ips');
const URL = require('url-parse');

const dnsLookupP = promisify(dns.lookup);

const checkHttp = async url => {
	let response;
	try {
		response = await got(url, {rejectUnauthorized: false});
	} catch (error) {
		return error.response.body;
	}

	if (response.headers && response.headers.location) {
		const url = new URL(response.headers.location);
		const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, ''); // Strip [] from IPv6

		if (routerIps.has(hostname)) {
			throw "Destination found in router IPs list";
		}
	}

	return true;
};

const getAddress = async hostname => net.isIP(hostname) ? hostname : (await dnsLookupP(hostname)).address;

const isTargetReachable = async target => {
	const url = new URL(prependHttp(target));

	if (!url.port) {
		url.port = url.protocol === 'http:' ? 80 : 443;
	}

	const address = await getAddress(url.hostname);

	if (!address || routerIps.has(address)) {
		throw 'Address not found!';
	}

	if ([80, 443].includes(url.port)) {
		return checkHttp(url.toString());
	}

	if (!isPortReachable(url.port, { host: address })) {
		throw "Port not reachable";
	}

	return true;
};

module.exports = async (destinations, options) => {
	options = {...options};
	options.timeout = typeof options.timeout === 'number' ? options.timeout : 5000;

	try {
		const promise = pAny(arrify(destinations).map(isTargetReachable));
		return pTimeout(promise, options.timeout);
	} catch (e) {
		if (options.throw === true) {
			throw e;
		}

		return false;
	}
};
