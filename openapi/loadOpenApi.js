const { Octokit } = require('@octokit/rest');
const { log, startLoading, stopLoading } = require('../common/log');
const fs = require('fs');

async function loadOpenApi({ token, owner, name, path }) {
  log('openapi config').load.start();
  startLoading();
  const octokit = new Octokit({ auth: `token ${token}` });
  const { data } = await octokit.repos.getContents({
    owner,
    path,
    repo: name,
  });
  stopLoading();
  log('openapi config').load.done();
  return JSON.parse(Buffer.from(data.content, 'base64').toString());
}

module.exports.loadOpenApi = loadOpenApi;
