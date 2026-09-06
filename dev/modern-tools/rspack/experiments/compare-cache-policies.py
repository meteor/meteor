"""Run sequential, guarded cache experiments against the existing #14655 fixture."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

POLICIES = ("baseline", "bypass-large", "cap-128", "rotate-arch")
ARCHITECTURES = ("web.browser", "web.browser.legacy")
FUNCTIONS = 400


def read_events(log: Path, prefix: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    with log.open() as stream:
        for line in stream:
            if prefix in line:
                events.append(json.loads(line.split(prefix, 1)[1]))
    return events


def compare_outputs(output: Path, control: Path) -> list[dict[str, Any]]:
    comparisons: list[dict[str, Any]] = []
    for arch in ARCHITECTURES:
        for filename in ("app.js", "app.js.map"):
            relative = Path("output/bundle/programs") / arch / "app" / filename
            actual = (output / relative).read_bytes()
            expected = (control / relative).read_bytes()
            identical = actual == expected
            comparisons.append({"arch": arch, "file": filename, "bytes": len(actual),
                                "sha256": hashlib.sha256(actual).hexdigest(),
                                "identical": identical})
            if not identical:
                raise RuntimeError(f"Output differs from control: {relative}")
    return comparisons


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--monitor", type=Path, required=True)
    parser.add_argument("--control", type=Path, required=True)
    parser.add_argument("--modules", type=int, choices=(200, 400), required=True)
    parser.add_argument("--repeats", type=int, choices=(1, 2), default=2)
    parser.add_argument("--label", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[4]
    preload = Path(__file__).with_name("cache-policy-preload.cjs").resolve()
    output_root = args.artifacts.resolve() / args.label
    output_root.mkdir(exist_ok=False)
    environment = dict(os.environ)
    environment.update({
        "PATH": str(root / "dev_bundle/bin") + os.pathsep + environment["PATH"],
        "npm_config_ignore_scripts": "true",
        "TOOL_NODE_FLAGS": f"--max-old-space-size=2048 --require={preload}",
        "METEOR_PROFILE": "1",
        "METEOR_LINKER_MEMORY_TRACE": "1",
        "METEOR_LINKER_TARGET_CACHE": "0",
        "METEOR_FORCE_EXCLUDE_ARCHS": "web.cordova",
        "MODULES": str(args.modules),
        "FUNCS": str(FUNCTIONS),
    })
    subprocess.run([str(root / "dev_bundle/bin/node"), "generate.js"],
                   cwd=args.fixture, env=environment, check=True)

    for repeat in range(1, args.repeats + 1):
        # Reverse the second pass to reduce a simple order/warmup bias.
        policies = POLICIES if repeat == 1 else tuple(reversed(POLICIES))
        for policy in policies:
            run_name = f"{policy}-{repeat}"
            output = output_root / run_name
            cache = args.fixture / ".meteor/local/bundler-cache/linker"
            if cache.exists():
                cache.rename(output_root / f"linker-cache-before-{run_name}")
            environment["METEOR_LINKER_CACHE_EXPERIMENT"] = policy
            command = [sys.executable, str(args.monitor), "--output", str(output),
                       "--cwd", str(args.fixture), "--timeout", "900",
                       "--rss-limit-mib", "6144", "--", str(root / "meteor"),
                       "build", "--debug", "--directory", str(output / "output")]
            print(f"Starting {args.modules}x{FUNCTIONS} {run_name}", flush=True)
            subprocess.run(command, env=environment, check=True, stdout=subprocess.DEVNULL)
            summary = json.loads((output / "summary.json").read_text())
            policy_events = read_events(output / "build.log", "[cache-policy] ")
            trace = read_events(output / "build.log", "[linker-memory] ")
            matches = [event for event in policy_events if event["event"] == "matched"]
            if len(matches) != 1 or matches[0]["policy"] != policy:
                raise RuntimeError(f"Intervention not verified: {run_name}")
            comparison = {
                "policy": policy, "modules": args.modules, "functions": FUNCTIONS,
                "repeat": repeat, "summary": summary, "policyEvents": policy_events,
                "linkerEvents": trace, "traceEnabled": True,
                "targetCacheEnabled": False,
                "control": str(args.control),
            }
            if summary["exit_code"] == 0:
                comparison["outputs"] = compare_outputs(output, args.control)
            else:
                with (output / "build.log").open() as stream:
                    is_heap_oom = any("JavaScript heap out of memory" in line for line in stream)
                if summary["signal"] != 6 or not is_heap_oom or summary["guard_termination"]:
                    raise RuntimeError(f"Unexpected failure: {run_name}: {summary}")
                comparison["failure"] = "JavaScript heap out of memory"
            (output / "comparison.json").write_text(json.dumps(comparison, indent=2) + "\n")
            print(json.dumps({"run": run_name, "exit": summary["exit_code"],
                              "signal": summary["signal"], "wall_s": summary["wall_s"],
                              "peak_tree_mib": summary["sampled_peak_tree_mib"]}), flush=True)


if __name__ == "__main__":
    main()
