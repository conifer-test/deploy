#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const { ConiferCdkStack } = require('../lib/conifer_cdk-stack');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('../conifer-config.json'));
const makeGlob = (files) => {
  const fileNames = files.map((filePath) => {
    return path.parse(path.parse(filePath).name).name;
  });
  const filesNamesString = fileNames.join(',');
  return `cypress/**/{${filesNamesString}}.{cy,spec}.{js,jsx,ts,tsx}`;
};

const app = new cdk.App();
new ConiferCdkStack(app, 'ConiferCdkStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
    ec2InstanceType: config.ec2InstanceType,
    appImage: config.imageUri, // TODO: Add image
    tests: config.testGroupings.map((testGrouping) => makeGlob(testGrouping)),
    taskMemoryLimit: 7000,
  },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
