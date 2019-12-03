variable "project" {
  type = "string"
}

variable "region" {
  type = "string"
  default = "us-central1"
}

variable "bucket" {
  type = "string"
}

variable "shared_secret" {
  type = "string"
}

provider "google" {
  project = "${var.project}"
  region  = "${var.region}"
  credentials = "${file("google.json")}"
}

resource "google_bigquery_dataset" "positions" {
  dataset_id    = "positions"
  friendly_name = "Positions"
  description   = "Longitudinal and latitudinal positions from buses on the road"
  location      = "${var.region}"
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }
  access {
    role          = "READER"
    special_group = "allAuthenticatedUsers"
  }
}

resource "google_bigquery_table" "positions_raw" {
  depends_on = [ "google_bigquery_dataset.positions" ]
  dataset_id = "${google_bigquery_dataset.positions.dataset_id}"
  table_id   = "raw"
  friendly_name = "${google_bigquery_dataset.positions.friendly_name} (Raw)"
  description = "${google_bigquery_dataset.positions.description}"
  clustering = [
    "date",
    "route",
    "trip",
    "stop"
  ]
  time_partitioning {
    type = "DAY"
    field = "date"
  }
  schema = <<EOF
  [
    {
      "name": "vehicle",
      "description": "Unique identifier for the vehicle",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "direction",
      "description": "Ordinal representing the heading of the vehicle",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "route",
      "description": "Identifier for the route the vehicle is traveling along",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "trip",
      "description": "Identifier for the trip, which represents a route at a given time",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "stop",
      "description": "Ordinal representing the next trip stop the vehicle is approaching",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "location",
      "description": "Geographic location the vehicle is currently present",
      "type": "GEOGRAPHY",
      "mode": "REQUIRED"
    },
    {
      "name": "datetime",
      "description": "Date and time when the position was observed from the vehicle",
      "type": "DATETIME",
      "mode": "REQUIRED"
    },
    {
      "name": "date",
      "description": "Service date, which may not be the same date from the timestamp",
      "type": "DATE",
      "mode": "REQUIRED"
    }
  ]
  EOF
}

resource "google_bigquery_dataset" "schedule" {
  dataset_id    = "schedule"
  friendly_name = "Schedule"
  description   = "Static schedule data, updated every Friday"
  location      = "${var.region}"
  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }
  access {
    role          = "WRITER"
    special_group = "projectWriters"
  }
  access {
    role          = "READER"
    special_group = "allAuthenticatedUsers"
  }
}

resource "google_bigquery_table" "routes" {
  depends_on = [ "google_bigquery_dataset.schedule" ]
  dataset_id = "${google_bigquery_dataset.schedule.dataset_id}"
  table_id   = "routes"
  friendly_name = "Routes"
  description = "Routes that a provide regular bus service"
  time_partitioning {
    type = "DAY"
    field = "date"
  }
  schema = <<EOF
  [
    {
      "name": "id",
      "description": "Internal unique identifier for the route",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "code",
      "description": "External unique identifier for the route",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "names",
      "description": "List of terminus names for the route",
      "type": "STRING",
      "mode": "REPEATED"
    },
    {
      "name": "date",
      "description": "Schedule date the route is effective",
      "type": "DATE",
      "mode": "REQUIRED"
    }
  ]
  EOF
}

resource "google_bigquery_table" "trips" {
  depends_on = [ "google_bigquery_dataset.schedule" ]
  dataset_id = "${google_bigquery_dataset.schedule.dataset_id}"
  table_id   = "trips"
  friendly_name = "Trips"
  description = "Bus services at a specific time of day in the week"
  time_partitioning {
    type = "DAY"
    field = "date"
  }
  schema = <<EOF
  [
    {
      "name": "id",
      "description": "Internal unique identifier for the trip",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "route",
      "description": "Identifier of the route providing service",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "headsign",
      "description": "Human-readable name of the trip that is displayed on the vehicle",
      "type": "STRING",
      "mode": "REQUIRED"
    },
    {
      "name": "direction",
      "description": "Ordinal representing the heading of the trip",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "block",
      "description": "Identifier that references the vehicle schedule for the day",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "path",
      "description": "Identifier that references the road path of the trip",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "date",
      "description": "Schedule date the trip is effective",
      "type": "DATE",
      "mode": "REQUIRED"
    }
  ]
  EOF
}

resource "google_bigquery_table" "stops" {
  depends_on = [ "google_bigquery_dataset.schedule" ]
  dataset_id = "${google_bigquery_dataset.schedule.dataset_id}"
  table_id   = "stops"
  friendly_name = "Stops"
  description = "Bus stops along particular routes"
  time_partitioning {
    type = "DAY"
    field = "date"
  }
  schema = <<EOF
  [
    {
      "name": "id",
      "description": "Internal unique identifier for the stop",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "code",
      "description": "External unique identifier for the stop",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "name",
      "description": "Name of the stop, typically an intersection",
      "type": "STRING",
      "mode": "REQUIRED"
    },
    {
      "name": "location",
      "description": "Well-known text (WKT) representing the geography of the stop",
      "type": "GEOGRAPHY",
      "mode": "REQUIRED"
    },
    {
      "name": "date",
      "description": "Schedule date the stop is effective",
      "type": "DATE",
      "mode": "REQUIRED"
    }
  ]
  EOF
}

resource "google_bigquery_table" "paths" {
  depends_on = [ "google_bigquery_dataset.schedule" ]
  dataset_id = "${google_bigquery_dataset.schedule.dataset_id}"
  table_id   = "paths"
  friendly_name = "Paths"
  description = "Lists of coordinates representing the path of a trips"
  time_partitioning {
    type = "DAY"
    field = "date"
  }
  schema = <<EOF
  [
    {
      "name": "id",
      "description": "Internal unique identifier for the path",
      "type": "INTEGER",
      "mode": "REQUIRED"
    },
    {
      "name": "location",
      "description": "Well-known text (WKT) representing the geography of the path",
      "type": "GEOGRAPHY",
      "mode": "REQUIRED"
    },
    {
      "name": "date",
      "description": "Schedule date the path is effective",
      "type": "DATE",
      "mode": "REQUIRED"
    }
  ]
  EOF
}

data "archive_file" "function_zip" {
  type        = "zip"
  source_dir  = "${path.root}/func"
  output_path = "${path.root}/dist/function.zip"
}

resource "google_storage_bucket_object" "function_object" {
  depends_on = ["data.archive_file.function_zip"]
  name   = "function/${data.archive_file.function_zip.output_sha}.zip"
  bucket = "${var.bucket}"
  source = "${data.archive_file.function_zip.output_path}"
}

resource "google_cloudfunctions_function" "function" {
  depends_on = ["google_storage_bucket_object.function_object"]
  name                  = "proxy"
  description           = "HTTP proxy to generate Google oauth tokens"
  region                = "us-central1"
  available_memory_mb   = 128
  source_archive_bucket = "${google_storage_bucket_object.function_object.bucket}"
  source_archive_object = "${google_storage_bucket_object.function_object.name}"
  timeout               = 60
  entry_point           = "proxy"
  trigger_http          = true
  runtime               = "nodejs8"
}
