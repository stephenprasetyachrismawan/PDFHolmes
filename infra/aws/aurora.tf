# Aurora PostgreSQL Serverless v2 (§12). PostgreSQL 16 (dukung scale-to-zero),
# min ACU 0 (auto-pause idle), pgvector. Subnet privat, akses dari SG app saja.

data "aws_vpc" "selected" {
  id      = var.vpc_id != "" ? var.vpc_id : null
  default = var.vpc_id == "" ? true : null
}

data "aws_subnets" "vpc" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected.id]
  }
}

resource "random_password" "db" {
  length  = 24
  special = false
}

# Kredensial DB di Secrets Manager (§12 langkah 4).
resource "aws_secretsmanager_secret" "db" {
  name = "${var.project}/aurora/credentials"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db.result
    dbname   = var.db_name
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    url      = "postgres://${var.db_master_username}:${random_password.db.result}@${aws_rds_cluster.main.endpoint}:5432/${var.db_name}"
  })
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-aurora"
  subnet_ids = data.aws_subnets.vpc.ids
}

# SG: izinkan 5432 hanya dari CIDR app (mis. subnet EC2). Jangan publik.
resource "aws_security_group" "aurora" {
  name        = "${var.project}-aurora"
  description = "Aurora PostgreSQL - akses dari host app saja"
  vpc_id      = data.aws_vpc.selected.id

  ingress {
    description = "PostgreSQL dari app"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.allowed_app_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier   = "${var.project}-aurora"
  engine               = "aurora-postgresql"
  engine_mode          = "provisioned"
  engine_version       = "16.4"
  database_name        = var.db_name
  master_username      = var.db_master_username
  master_password      = random_password.db.result
  storage_encrypted    = true
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]

  # Serverless v2: min 0 ACU = auto-pause (hemat; cold start ±15s).
  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  skip_final_snapshot = true
  apply_immediately   = true
}

resource "aws_rds_cluster_instance" "main" {
  identifier         = "${var.project}-aurora-1"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}
