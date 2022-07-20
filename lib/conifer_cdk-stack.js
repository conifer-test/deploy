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

    const { ec2InstanceType, appImage, taskMemoryLimit, tests } = props.env;

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

    const taskDefinitionArns = [];
    // Instantiate task definitions
    tests.forEach((testGlob, index) => {
      const coniferTaskDefinition = new ecs.Ec2TaskDefinition(this, `conifer-task-${index}`, {
        family: `coniferTask${index}`
      });

      coniferTaskDefinition.addContainer(`conifer-container-${index}`, {
        image: ecs.ContainerImage.fromRegistry(appImage),
        memoryLimitMiB: taskMemoryLimit,
        environment: { FILES_GLOB: testGlob }
      });

      taskDefinitionArns.push(coniferTaskDefinition.taskDefinitionArn);
    })

    new cdk.CfnOutput(this, 'taskDefinitionArns', {value: taskDefinitionArns});

    const s3Bucket = new s3.Bucket(this, 'conifer-test-output-bucket', {
      bucketName: 'conifer-test-output-bucket',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      publicReadAccess: true,
      autoDeleteObjects: true,
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

    // 👇 add policy statements ot the bucket policy
    s3Bucket.policy.document.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:DeleteObject',
        ],
        resources: [`${s3Bucket.bucketArn}/*`],
      }),
    );

    const myClusterArn = cluster.clusterArn;
    const myBucketArn = s3Bucket.bucketArn;
    new cdk.CfnOutput(this, 'region', {value: cdk.Stack.of(this).region});
    new cdk.CfnOutput(this, 'clusterArn', {value: myClusterArn});
    new cdk.CfnOutput(this, 'bucketArn', {value: myBucketArn});
  }
}

module.exports = { ConiferCdkStack }
