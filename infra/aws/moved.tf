# Migrasi state non-destruktif. Resource Aurora kini pakai count (enable_aurora),
# sehingga address berubah dari `.main` menjadi `.main[0]`. Tanpa moved block,
# workspace lama dengan Aurora hidup akan dianggap "destroy lama + create baru"
# (replacement merusak DB, apalagi skip_final_snapshot=true).
#
# moved block hanya berefek saat target ada (enable_aurora=true -> index 0).
# Bila enable_aurora=false, target tak ada -> Terraform hapus resource lama
# secara wajar (memang itu maksud beralih ke DB container).

moved {
  from = random_password.db
  to   = random_password.db[0]
}

moved {
  from = aws_secretsmanager_secret.db
  to   = aws_secretsmanager_secret.db[0]
}

moved {
  from = aws_secretsmanager_secret_version.db
  to   = aws_secretsmanager_secret_version.db[0]
}

moved {
  from = aws_db_subnet_group.main
  to   = aws_db_subnet_group.main[0]
}

moved {
  from = aws_security_group.aurora
  to   = aws_security_group.aurora[0]
}

moved {
  from = aws_rds_cluster.main
  to   = aws_rds_cluster.main[0]
}

moved {
  from = aws_rds_cluster_instance.main
  to   = aws_rds_cluster_instance.main[0]
}
