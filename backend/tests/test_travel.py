from backend.optimizer.travel import build_matrix, travel_minutes


def test_zero_distance_to_self():
    assert travel_minutes(10, 10, 10, 10) == 0


def test_symmetry():
    assert travel_minutes(0, 0, 30, 40) == travel_minutes(30, 40, 0, 0)


def test_known_triangle():
    # 3-4-5 triangle: distance 50 at speed_factor 1 => 50 minutes.
    assert travel_minutes(0, 0, 30, 40) == 50


def test_traffic_multiplier_scales_linearly():
    base = travel_minutes(0, 0, 30, 40, traffic=1.0)
    doubled = travel_minutes(0, 0, 30, 40, traffic=2.0)
    assert doubled == 2 * base


def test_speed_factor():
    assert travel_minutes(0, 0, 0, 10, speed_factor=2.0) == 20


def test_build_matrix_shape_and_diagonal():
    pts = [(0, 0), (3, 4), (6, 8)]
    m = build_matrix(pts)
    assert m[(0, 0)] == 0 and m[(1, 1)] == 0
    assert m[(0, 1)] == 5
    assert m[(0, 1)] == m[(1, 0)]
