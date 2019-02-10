# Get buses that have moved in the last 3 minutes.
SELECT
    bus.*
FROM
    bus
RIGHT JOIN
(
    SELECT
        vehicle, MAX(time) AS time
    FROM
        bus
    GROUP BY
        vehicle
    HAVING
        # FIXME(ashcon): Why is there a mysterious 28800 offset?
        TIMESTAMPDIFF(SECOND, MAX(time), NOW()) - 28800 <= 3 * 60
) AS latest
ON
    latest.vehicle = bus.vehicle
AND
    latest.time = bus.time
ORDER BY
    time DESC
