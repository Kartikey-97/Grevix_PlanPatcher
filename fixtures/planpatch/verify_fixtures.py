#!/usr/bin/env python3
"""Recompute PlanPatch demo schedules and ranking scores using only Python stdlib.

This is a fixture verifier, not the product implementation. The production engine
should port these rules into pure TypeScript functions and retain these outputs as tests.
"""
from __future__ import annotations
import copy
import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
plan = json.loads((HERE / "plan.json").read_text())
scenarios_doc = json.loads((HERE / "scenarios.json").read_text())
policy = json.loads((HERE / "ranking-policy.json").read_text())


def deep_merge(base: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in update.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def topological_order(tasks: list[dict], deps: list[dict]) -> list[str]:
    ids = {t["id"] for t in tasks}
    incoming = {tid: 0 for tid in ids}
    outgoing = {tid: [] for tid in ids}
    for d in deps:
        if not d.get("blocksExecution", False):
            continue
        a, b = d["fromTaskId"], d["toTaskId"]
        if a not in ids or b not in ids:
            raise ValueError(f"Dependency {d['id']} points to a missing task")
        outgoing[a].append(b)
        incoming[b] += 1
    queue = [t["id"] for t in tasks if incoming[t["id"]] == 0]
    order = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for nxt in outgoing[current]:
            incoming[nxt] -= 1
            if incoming[nxt] == 0:
                queue.append(nxt)
    if len(order) != len(ids):
        raise ValueError("Dependency graph contains a cycle")
    return order


def schedule(tasks: list[dict], deps: list[dict]) -> dict[str, dict[str, float]]:
    order = topological_order(tasks, deps)
    by_id = {t["id"]: t for t in tasks}
    pred = {tid: [] for tid in by_id}
    for d in deps:
        if d.get("blocksExecution", False):
            pred[d["toTaskId"]].append(d["fromTaskId"])
    times: dict[str, dict[str, float]] = {}
    for tid in order:
        start = max((times[p]["finishHours"] for p in pred[tid]), default=0.0)
        finish = start + float(by_id[tid]["durationHours"])
        times[tid] = {"startHours": start, "finishHours": finish}
    return times


def apply_candidate(base_plan: dict, scenario: dict, candidate: dict) -> tuple[list[dict], list[dict], dict]:
    task_overrides = candidate.get("taskOverrides", {})
    removed = set(candidate.get("removedTaskIds", []))
    tasks = []
    for task in base_plan["tasks"]:
        if task["id"] in removed:
            continue
        tasks.append(deep_merge(task, task_overrides.get(task["id"], {})))
    task_ids = {t["id"] for t in tasks}
    # Removing an optional task also removes its incident edges; other dangling edges are errors.
    deps = []
    for dep in base_plan["dependencies"]:
        if dep["fromTaskId"] not in task_ids or dep["toTaskId"] not in task_ids:
            if dep["fromTaskId"] in removed or dep["toTaskId"] in removed:
                continue
            raise ValueError(f"Unexpected missing endpoint in {dep['id']}")
        deps.append(copy.deepcopy(dep))
    constraints = copy.deepcopy(base_plan["constraints"])
    constraints.update(scenario.get("constraintOverrides", {}))
    constraints.update(candidate.get("constraintOverrides", {}))
    return tasks, deps, constraints


def calculate_metrics(base_plan: dict, original_times: dict, scenario: dict, candidate: dict) -> dict:
    tasks, deps, constraints = apply_candidate(base_plan, scenario, candidate)
    times = schedule(tasks, deps)
    task_by_id = {t["id"]: t for t in tasks}
    original_task_by_id = {t["id"]: t for t in base_plan["tasks"]}
    original_count = len(base_plan["tasks"])
    priority_denominator = sum(t["priority"] for t in base_plan["tasks"])
    changed = list(candidate.get("changedTaskIds", []))
    lost_ids = candidate.get("lostTaskIds", [])
    removed_ids = candidate.get("removedTaskIds", [])
    total_cost = sum(float(t["cost"]) for t in tasks)
    budget = float(constraints["budgetLimit"])
    deadline = constraints.get("deadlineHours")
    finish = max(v["finishHours"] for v in times.values())
    slack = None if deadline is None else float(deadline) - finish
    if slack is None or slack >= base_plan["scoring"]["deadlineSlackReferenceHours"]:
        q = 0.0
    else:
        q = 1.0 - max(slack, 0.0) / base_plan["scoring"]["deadlineSlackReferenceHours"]
    moved = []
    for tid, new_t in times.items():
        if tid not in original_times:
            continue
        delta = abs(new_t["startHours"] - original_times[tid]["startHours"])
        if delta > 1e-9:
            moved.append({"taskId": tid, "priority": task_by_id[tid]["priority"], "absoluteStartShiftHours": delta})
    if moved:
        avg_shift = sum(x["priority"] * x["absoluteStartShiftHours"] for x in moved) / sum(x["priority"] for x in moved)
        m = min(avg_shift / base_plan["scoring"]["scheduleShiftReferenceHours"], 1.0)
    else:
        avg_shift = 0.0
        m = 0.0
    s = 0.7 * m + 0.3 * q
    unknown = candidate.get("unknownFacts", [])
    risk_denominator = int(base_plan["scoring"]["uncertaintyFactCount"])
    r = min(len(unknown) / risk_denominator, 1.0)
    e = min(len(changed) / original_count, 1.0)
    lost_priority = sum(original_task_by_id[tid]["priority"] for tid in lost_ids)
    l = min(lost_priority / priority_denominator, 1.0)
    c = total_cost / budget if budget > 0 else 1.0
    # Numerical validation for the constraints defined in this fixture.
    budget_pass = total_cost <= budget + 1e-9
    deadline_pass = deadline is None or finish <= float(deadline) + 1e-9
    capacity = task_by_id["T03"]["outputs"]["capacity"] if "T03" in task_by_id else 0
    registration = task_by_id.get("T05", {})
    reg_out = registration.get("outputs", {})
    attendees = int(reg_out.get("expectedAttendees", constraints.get("expectedAttendance", 0)))
    sessions = max(1, int(reg_out.get("sessionCount", 1)))
    required_per_session = (attendees + sessions - 1) // sessions
    capacity_pass = required_per_session <= int(capacity)
    accessibility_pass = bool(task_by_id.get("T03", {}).get("outputs", {}).get("accessible", False)) if constraints.get("minimumAccessibility") else True
    order = topological_order(tasks, deps)
    fixed_preserved = all(
        tid in task_by_id and task_by_id[tid] == original_task_by_id[tid]
        for tid in [t["id"] for t in base_plan["tasks"] if t["policy"] == "fixed"]
    )
    # T15/T01/T02/T09 are fixed. Status fields on replaceable T03 never affect this check.
    hard_pass = budget_pass and deadline_pass and capacity_pass and accessibility_pass and fixed_preserved
    verification_status = "provisional" if unknown else "verified_in_fixture"
    scores = {}
    for profile_id, profile in policy["profiles"].items():
        w = profile["weights"]
        score = (w["changeFootprint"] * e + w["lostTaskValue"] * l + w["budgetUsage"] * c
                 + w["scheduleDisruption"] * s + w["uncertainty"] * r)
        scores[profile_id] = round(score, 8)
    return {
        "candidateId": candidate["id"],
        "label": candidate["label"],
        "changedTaskIds": changed,
        "removedTaskIds": removed_ids,
        "lostTaskIds": lost_ids,
        "projectedTotalCost": int(total_cost),
        "budgetLimit": int(budget),
        "budgetMargin": int(budget - total_cost),
        "taskCount": len(tasks),
        "earliestProjectFinishHours": round(finish, 4),
        "deadlineHours": deadline,
        "deadlineSlackHours": None if slack is None else round(slack, 4),
        "movedTaskStartTimes": moved,
        "weightedMeanAbsoluteStartShiftHours": round(avg_shift, 6),
        "metrics": {
            "changeFootprint_E": round(e, 8),
            "lostTaskValue_L": round(l, 8),
            "budgetUsage_C": round(c, 8),
            "movement_M": round(m, 8),
            "deadlinePressure_Q": round(q, 8),
            "scheduleDisruption_S": round(s, 8),
            "uncertainty_R": round(r, 8)
        },
        "unknownFacts": unknown,
        "verificationStatus": verification_status,
        "validation": {
            "budgetPass": budget_pass,
            "deadlinePass": deadline_pass,
            "capacityPass": capacity_pass,
            "accessibilityPass": accessibility_pass,
            "fixedTasksPreserved": fixed_preserved,
            "acyclic": True,
            "hardConstraintsPass": hard_pass
        },
        "scores": scores
    }


def main() -> None:
    base_tasks = plan["tasks"]
    base_deps = plan["dependencies"]
    base_times = schedule(base_tasks, base_deps)
    baseline_cost = sum(t["cost"] for t in base_tasks)
    base_finish = max(v["finishHours"] for v in base_times.values())
    baseline_priority_sum = sum(t["priority"] for t in base_tasks)
    scenarios_out = []
    for scenario in scenarios_doc["scenarios"]:
        candidates = [calculate_metrics(plan, base_times, scenario, c) for c in scenario["candidatePatches"]]
        rankings = {}
        for profile_id in policy["profiles"]:
            feasible = [c for c in candidates if c["validation"]["hardConstraintsPass"]]
            ordered = sorted(feasible, key=lambda c: (c["scores"][profile_id], len(c["changedTaskIds"]), len(c["unknownFacts"]), c["candidateId"]))
            rankings[profile_id] = [
                {"rank": i + 1, "candidateId": c["candidateId"], "score": c["scores"][profile_id]}
                for i, c in enumerate(ordered)
            ]
        scenarios_out.append({
            "scenarioId": scenario["id"],
            "title": scenario["title"],
            "purpose": scenario["purpose"],
            "baselineAfterDisruption": {
                "totalCostBeforePatch": int(baseline_cost),
                "budgetLimit": scenario.get("constraintOverrides", {}).get("budgetLimit", plan["constraints"]["budgetLimit"]),
                "deadlineHours": scenario.get("constraintOverrides", {}).get("deadlineHours", plan["constraints"]["deadlineHours"]),
                "originalFinishHours": round(base_finish, 4),
                "originalTaskPrioritySum": baseline_priority_sum,
                "baselineValidation": {
                    "budgetPass": baseline_cost <= scenario.get("constraintOverrides", {}).get("budgetLimit", plan["constraints"]["budgetLimit"]),
                    "deadlinePass": scenario.get("constraintOverrides", {}).get("deadlineHours", plan["constraints"]["deadlineHours"]) >= base_finish,
                    "overallHardConstraintsPass": (baseline_cost <= scenario.get("constraintOverrides", {}).get("budgetLimit", plan["constraints"]["budgetLimit"]) and scenario.get("constraintOverrides", {}).get("deadlineHours", plan["constraints"]["deadlineHours"]) >= base_finish)
                },
                "note": "Initial feasibility is reevaluated against the scenario's changed constraint; schedule start times are calculated from task durations and dependencies."
            },
            "candidates": candidates,
            "rankings": rankings
        })
    result = {
        "schemaVersion": "1.0.0",
        "generatedBy": "verify_fixtures.py",
        "baseline": {
            "taskCount": len(base_tasks),
            "totalCost": int(baseline_cost),
            "budgetLimit": plan["constraints"]["budgetLimit"],
            "deadlineHours": plan["constraints"]["deadlineHours"],
            "earliestFinishHours": round(base_finish, 4),
            "deadlineSlackHours": round(plan["constraints"]["deadlineHours"] - base_finish, 4),
            "prioritySum": baseline_priority_sum,
            "earliestTimes": base_times,
            "criticalPathOne": ["T01","T02","T03","T05","T07","T14","T15"],
            "criticalPathTwo": ["T01","T02","T03","T05","T13","T14","T15"]
        },
        "scenarios": scenarios_out,
        "expectedWinners": {
            "S1-venue-cancelled": {
                "preserve_plan": "S1-A-community-hall",
                "minimize_spending": "S1-B-campus-auditorium",
                "protect_deadline": "S1-A-community-hall"
            },
            "S2-budget-cut": {
                "preserve_plan": "S2-A-lecture-hall-lean",
                "minimize_spending": "S2-B-department-hall-lean",
                "protect_deadline": "S2-A-lecture-hall-lean"
            },
            "S3-deadline-moved-earlier": {
                "preserve_plan": "S3-A-early-registration-close",
                "minimize_spending": "S3-A-early-registration-close",
                "protect_deadline": "S3-B-fast-track-venue-and-registration"
            }
        }
    }
    outpath = HERE / "expected-results.json"
    outpath.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    # Fail loudly when core design expectations drift.
    assert len(base_tasks) == 16, f"expected 16 tasks, got {len(base_tasks)}"
    assert baseline_cost == 18000, f"expected baseline INR 18000, got {baseline_cost}"
    assert base_finish == 132, f"expected baseline finish 132h, got {base_finish}"
    assert baseline_priority_sum == 64, f"expected priority sum 64, got {baseline_priority_sum}"
    for s in scenarios_out:
        for c in s["candidates"]:
            assert c["validation"]["hardConstraintsPass"], f"candidate unexpectedly infeasible: {c['candidateId']} {c['validation']}"
    for sid, expected in result["expectedWinners"].items():
        scenario_result = next(s for s in scenarios_out if s["scenarioId"] == sid)
        for profile_id, expected_id in expected.items():
            actual = scenario_result["rankings"][profile_id][0]["candidateId"]
            assert actual == expected_id, f"winner mismatch {sid}/{profile_id}: {actual} != {expected_id}"
    print(json.dumps({
        "status": "PASS",
        "output": str(outpath),
        "baseline": result["baseline"],
        "winners": result["expectedWinners"]
    }, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
