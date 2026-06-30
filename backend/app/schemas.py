"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class RoutingOverride(BaseModel):
    """Per-request, session-only routing config from the UI. Takes precedence
    over server env config; never persisted or logged."""
    provider: Optional[Literal["haversine", "openrouteservice", "osrm"]] = None
    api_key: Optional[str] = None
    osrm_base_url: Optional[str] = None


class OptimizeRequest(BaseModel):
    technician_count: Optional[int] = Field(default=None, ge=1, le=50)
    job_count: Optional[int] = Field(default=None, ge=1, le=500)
    traffic_penalty: float = Field(default=1.0, ge=1.0, le=3.0)
    emergency_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    skill_shortage: Optional[str] = None
    sla_strictness: Literal["lenient", "normal", "strict"] = "normal"
    overtime_allowed: bool = True
    optimization_goal: Literal["balanced", "max_jobs", "min_travel", "protect_sla"] = "balanced"
    max_solve_seconds: Optional[float] = Field(default=None, ge=1.0, le=30.0)
    routing: Optional[RoutingOverride] = None

    def to_transform_kwargs(self) -> dict:
        d = self.model_dump()
        d.pop("routing", None)
        return d

    def routing_override(self) -> Optional[dict]:
        return self.routing.model_dump() if self.routing else None


class CapacitySweepRequest(OptimizeRequest):
    """Capacity analysis: the base scenario (inherited) plus the sweep range."""
    min_techs: int = Field(default=4, ge=1, le=50)
    max_techs: Optional[int] = Field(default=None, ge=1, le=50)
    steps: int = Field(default=5, ge=2, le=8)
    per_point_seconds: float = Field(default=3.0, ge=1.0, le=10.0)
    include_overtime_off: bool = True

    def sweep_kwargs(self) -> dict:
        return {
            "min_techs": self.min_techs,
            "max_techs": self.max_techs,
            "steps": self.steps,
            "per_point_seconds": self.per_point_seconds,
            "include_overtime_off": self.include_overtime_off,
            "routing_override": self.routing_override(),
        }

    def scenario_kwargs(self) -> dict:
        d = self.model_dump()
        for k in ("routing", "min_techs", "max_techs", "steps", "per_point_seconds", "include_overtime_off"):
            d.pop(k, None)
        return d
