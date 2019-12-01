provider "google" {
  project = "translink"
  region  = "northamerica-northeast1"
  credentials = "${file("google.json")}"
}

resource "google_bigquery_dataset" "realtime" {
  dataset_id    = "realtime"
  friendly_name = "Realtime"
  description   = "Stores realtime data from Translink, updated every 15 seconds"
  location      = "northamerica-northeast1"
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

resource "google_bigquery_table" "positions" {
  depends_on = [ "google_bigquery_dataset.realtime" ]
  dataset_id = "${google_bigquery_dataset.realtime.dataset_id}"
  table_id   = "positions"
  friendly_name = "Positions"
  description = "Longitudinal and latitudinal data from buses on the road"
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
