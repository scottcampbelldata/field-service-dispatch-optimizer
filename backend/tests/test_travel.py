from backend.optimizer.travel import (
    euclidean_minutes,
    haversine_km,
    haversine_minutes,
    make_euclidean_provider,
    make_matrix_provider,
)


def test_haversine_zero_to_self():
    assert haversine_km(40.0, -74.0, 40.0, -74.0) == 0.0


def test_haversine_known_distance():
    # ~1 degree of latitude ≈ 111 km.
    km = haversine_km(40.0, -74.0, 41.0, -74.0)
    assert 110 < km < 112


def test_haversine_minutes_uses_lon_lat_order_and_speed():
    # ax/bx = longitude, ay/by = latitude.
    m = haversine_minutes(-74.0, 40.0, -74.0, 41.0, speed_factor=1.5)
    assert 160 < m < 170  # ~111 km * 1.5 min/km


def test_euclidean_known_triangle():
    assert euclidean_minutes(0, 0, 30, 40, speed_factor=1.0) == 50


def test_euclidean_provider_callable():
    p = make_euclidean_provider(1.0)
    assert p(0, 0, 30, 40) == 50


def test_matrix_provider_lookup_and_fallback():
    pts = [(-74.0, 40.0), (-73.0, 41.0)]
    minutes = [[0, 25], [25, 0]]
    fallback = make_euclidean_provider(1.0)
    prov = make_matrix_provider(pts, minutes, fallback)
    # Known pair from the matrix.
    assert prov(-74.0, 40.0, -73.0, 41.0) == 25
    # Unknown point falls back to euclidean.
    assert prov(0, 0, 30, 40) == 50
