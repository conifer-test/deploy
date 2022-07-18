const { 
  Stack,
  Duration,
  aws_ec2: ec2,
  aws_ecs: ecs,
  aws_s3: s3,
  aws_iam: iam
} = require('aws-cdk-lib');
const cdk = require('aws-cdk-lib');
// const sqs = require('aws-cdk-lib/aws-sqs');

class ConiferCdkStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const { ec2InstanceType, appImage, tests } = props.env;

    // Create a vpc in which our infrastructure will reside
    const vpc = new ec2.Vpc(this, 'conifer-vpc', {
      cidr: '10.0.0.0/16',
      natGateways: 0,
      maxAzs: 1,
      subnetConfiguration: [
        {
          name: 'conifer-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      vpcName: "ConiferVPC"
    });

    // Create a Security Group for our cluster
    const coniferSG = new ec2.SecurityGroup(this, 'conifer-security-group', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for conifer (ec2 instances in particular)'
    });

    // Add access rules
    coniferSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'allow ssh access from anywhere'
    );
      
    coniferSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    coniferSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'allow HTTPS traffic from anywhere',
    );

    coniferSG.addIngressRule(
      ec2.Peer.ipv4('123.123.123.123/16'),
      ec2.Port.allIcmp(),
      'allow ICMP traffic from a specific IP range',
    );


    // Create an ECS Cluster
    const cluster = new ecs.Cluster(this, 'conifer-ECS-cluster', {
      vpc,
    });

    const autoScalingGroup = cluster.addCapacity('ConiferAutoScalingGroupCapacity', {
      instanceType: new ec2.InstanceType(ec2InstanceType),
      desiredCapacity: 1,
      keyName: "test-parallel-key",
      autoScalingGroupName: "ConiferEC2Instance",
      canContainersAccessInstanceRole: true
    });

    // autoScalingGroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('arn:aws:iam::522801653830:role/ecsInstanceRole'));
    const imRole = iam.Role.fromRoleName(this, 'ecsInstanceRole', 'ecsInstanceRole');
    autoScalingGroup.role.addManagedPolicy(imRole);

    // Command to execute in ec2 instance upon spinup
    const commands = [`sudo sysctl -w fs.inotify.max_user_watches=2000000`];

    autoScalingGroup.userData.addCommands(...commands);

    // Add security group to ec2 instances (override default)
    autoScalingGroup.addSecurityGroup(coniferSG);

    // Instantiate task definitions
    tests.forEach((testGlob, index) => {
      const coniferTaskDefinition = new ecs.Ec2TaskDefinition(this, `conifer-task-${index}`, {
        family: `coniferTask${index}`
      });

      coniferTaskDefinition.addContainer(`conifer-container-${index}`, {
        image: ecs.ContainerImage.fromRegistry(appImage),
        memoryLimitMiB: 7000,
        environment: { FILES_GLOB: testGlob }
      });
    })

    // const coniferTaskDefinition2 = new ecs.Ec2TaskDefinition(this, 'conifer-task-2', {
    //   family: 'coniferTask2'
    // });
    // coniferTaskDefinition2.addContainer('conifer-container-2', {
    //   image: ecs.ContainerImage.fromRegistry('ahmadjiha/cypress-realworld-app'),
    //   memoryLimitMiB: 7000,
    //   environment: { FILES_GLOB: tests[1]}
    // });

    // const coniferTaskDefinition3 = new ecs.Ec2TaskDefinition(this, 'conifer-task-3', {
    //   family: 'coniferTask3'
    // });
    // coniferTaskDefinition3.addContainer('conifer-container-3', {
    //   image: ecs.ContainerImage.fromRegistry('ahmadjiha/cypress-realworld-app'),
    //   memoryLimitMiB: 7000,
    //   environment: { FILES_GLOB: tests[2]}
    // });

    // const coniferTaskDefinition4 = new ecs.Ec2TaskDefinition(this, 'conifer-task-4', {
    //   family: 'coniferTasks4'
    // });
    // coniferTaskDefinition4.addContainer('conifer-container-4', {
    //   image: ecs.ContainerImage.fromRegistry('ahmadjiha/cypress-realworld-app'),
    //   memoryLimitMiB: 7000,
    //   environment: { FILES_GLOB: tests[3] }
    // });

    const s3Bucket = new s3.Bucket(this, 'conifer-test-output-bucket', {
      bucketName: 'conifer-test-output-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // 👇 create the bucket policy
    const bucketPolicy = new s3.BucketPolicy(this, 'bucket-policy-id-2', {
      bucket: s3Bucket,
    });

    // 👇 add policy statements ot the bucket policy
    bucketPolicy.document.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: [
          's3:PutObject',
          's3:GetObject',
          's3:DeleteObject',
          's3:GetBucket*'
        ],
        resources: [`${s3Bucket.bucketArn}/*`],
      }),
    );
    
  }
}

module.exports = { ConiferCdkStack }




