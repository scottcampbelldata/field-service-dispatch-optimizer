"""Pydantic request/response schemas for the API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


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

    def to_transform_kwargs(self) -> dict:
        return self.model_dump()
