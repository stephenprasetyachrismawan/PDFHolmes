# Aurora PostgreSQL Serverless v2 (§12) — OPSIONAL.
# Akun AWS "Free plan" baru menolak buat Aurora (FreeTierRestrictionError).
# Default: enable_aurora=false -> tak buat Aurora; DB jalan sbg container Postgres
# di EC2 (lihat infra/docker-compose.localdb.yml). Set enable_aurora=true hanya
# bila akun sudah Paid plan & mau DB managed.

data "aws_vpc" "selected" {
  count   = var.enable_aurora ? 1 : 0
  id      = var.vpc_id != "" ? var.vpc_id : null
  default = var.vpc_id == "" ? true : null
}

data "aws_subnets" "vpc" {
  count = var.enable_aurora ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected[0].id]
  }
}

resource "random_password" "db" {
  count   = var.enable_aurora ? 1 : 0
  length  = 24
  special = false
}

# Kredensial DB di Secrets Manager (§12 langkah 4).
resource "aws_secretsmanager_secret" "db" {
  count = var.enable_aurora ? 1 : 0
  name  = "${var.project}/aurora/credentials"
}

resource "aws_secretsmanager_secret_version" "db" {
  count     = var.enable_aurora ? 1 : 0
  secret_id = aws_secretsmanager_secret.db[0].id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db[0].result
    dbname   = var.db_name
    host     = aws_rds_cluster.main[0].endpoint
    port     = 5432
    url      = "postgres://${var.db_master_username}:${random_password.db[0].result}@${aws_rds_cluster.main[0].endpoint}:5432/${var.db_name}"
  })
}

resource "aws_db_subnet_group" "main" {
  count      = var.enable_aurora ? 1 : 0
  name       = "${var.project}-aurora"
  subnet_ids = data.aws_subnets.vpc[0].ids
}

# SG: izinkan 5432 hanya dari CIDR app (mis. subnet EC2). Jangan publik.
resource "aws_security_group" "aurora" {
  count       = var.enable_aurora ? 1 : 0
  name        = "${var.project}-aurora"
  description = "Aurora PostgreSQL - akses dari host app saja"
  vpc_id      = data.aws_vpc.selected[0].id

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
  count                = var.enable_aurora ? 1 : 0
  cluster_identifier   = "${var.project}-aurora"
  engine               = "aurora-postgresql"
  engine_mode          = "provisioned"
  engine_version       = "16.4"
  database_name        = var.db_name
  master_username      = var.db_master_username
  master_password      = random_password.db[0].result
  storage_encrypted    = true
  db_subnet_group_name = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.aurora[0].id]

  # Serverless v2: min 0 ACU = auto-pause (hemat; cold start ±15s).
  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_acu
    max_capacity = var.aurora_max_acu
  }

  skip_final_snapshot = true
  apply_immediately   = true
}

resource "aws_rds_cluster_instance" "main" {
  count              = var.enable_aurora ? 1 : 0
  identifier         = "${var.project}-aurora-1"
  cluster_identifier = aws_rds_cluster.main[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main[0].engine
  engine_version     = aws_rds_cluster.main[0].engine_version
}
