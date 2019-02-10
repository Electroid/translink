CREATE TABLE IF NOT EXISTS bus (
    vehicle INT NOT NULL,
    trip BIGINT NOT NULL,
    route SMALLINT NOT NULL,
    direction CHAR(16) NOT NULL,
    destination CHAR(64) NOT NULL,
    pattern CHAR(16) NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    time DATETIME NOT NULL,
    PRIMARY KEY (trip, time)
)
