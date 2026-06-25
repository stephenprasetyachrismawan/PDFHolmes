variable "region" {
  description = "Region AWS (mis. ap-southeast-1 Singapura, ap-southeast-3 Jakarta)"
  type        = string
  default     = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "pdfholmes"
}

variable "domain" {
  description = "Domain web publik (mis. pdfholmes.example.com) untuk callback Cognito"
  type        = string
}

variable "cognito_domain_prefix" {
  description = "Prefix unik global utk Hosted UI Cognito (mis. pdfholmes-app)"
  type        = string
}

# ---- Aurora ----
variable "enable_aurora" {
  description = "true = buat Aurora managed (butuh akun Paid plan). false = DB pakai container Postgres di EC2 (hemat, default)."
  type        = bool
  default     = false
}

variable "db_name" {
  type    = string
  default = "pdfholmes"
}

variable "db_master_username" {
  type    = string
  default = "pdfholmes_admin"
}

variable "aurora_min_acu" {
  description = "Min ACU. 0 = auto-pause saat idle (hemat, ada cold start ±15s)"
  type        = number
  default     = 0
}

variable "aurora_max_acu" {
  type    = number
  default = 2
}

variable "allowed_app_cidr" {
  description = "CIDR yang boleh konek ke Aurora (mis. CIDR subnet EC2 host). 0.0.0.0/0 hanya utk uji — JANGAN di prod."
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_id" {
  description = "VPC tempat Aurora ditempatkan. Kosongkan utk pakai default VPC."
  type        = string
  default     = ""
}
