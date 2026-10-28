"""Bundled Manim CE renderer. Input is validated lesson data, never Python source."""
import json
import os
import math
from pathlib import Path

import numpy as np
from manim import *
from manim import __version__ as manim_version
if manim_version != "0.22.0":
    raise RuntimeError("Ally requires Manim Community 0.22.0; run scripts/manim/setup.ps1")


def vec(value):
    return np.array([*value, 0.0] if len(value) == 2 else value, dtype=float)


class AllyLesson(ThreeDScene):
    def construct(self):
        request = json.loads(Path(os.environ["ALLY_MANIM_INPUT"]).read_text(encoding="utf-8"))
        spec = request["spec"]
        objects = {}
        math_ids = set()
        changed = set()
        hidden = set()
        rotations = {}
        scales = {}
        text_values = {}
        initial_heights = {}
        states = {}
        self.camera.background_color = "#111b20"
        mode = spec["preset"]
        tracker = None

        def remember(name, item):
            objects[name] = item
            self.add(item)
            return item

        if mode in ("fourier", "phasor"):
            self.set_camera_orientation(zoom=1/max(1,spec.get("amplitude", 1)))

        if mode == "scene":
            for item in spec["objects"]:
                kind, col = item["kind"], item["color"]
                at = vec(item.get("at", [0, 0]))
                if kind == "rect":
                    m = Rectangle(width=item.get("width", 1), height=item.get("height", 1))
                elif kind in ("circle", "dot"):
                    m = Circle(radius=item.get("radius", .08 if kind == "dot" else .5))
                elif kind in ("line", "arrow"):
                    points = [vec(p) for p in item["points"]]
                    if kind == "arrow":
                        m = Arrow(points[0], points[-1], buff=0)
                    else:
                        m = VMobject().set_points_as_corners(points)
                elif kind == "polygon":
                    m = Polygon(*[vec(p) for p in item["points"]])
                elif kind == "math":
                    m = MathTypst(item["text"], font_size=32)
                    if m.width > 12: m.scale_to_fit_width(12)
                    math_ids.add(item["id"])
                elif kind == "text":
                    m = Text(item["text"], font_size=24)
                elif kind == "box":
                    m = Cube(side_length=item.get("width", 1))
                else:
                    m = Sphere(radius=item.get("radius", .5), resolution=(12, 12))
                m.set_color(col)
                if item.get("fill"):
                    m.set_fill(col, opacity=.75)
                if kind not in ("line", "arrow", "polygon"):
                    m.move_to(at)
                remember(item["id"], m)
                initial_heights[item["id"]] = max(float(m.height), 0.0001)
                text_values[item["id"]] = item.get("text")
            for name, members in spec["groups"].items():
                objects[name] = VGroup(*[objects[m] for m in members])
            if any(o["kind"] in ("box", "sphere") for o in spec["objects"]):
                self.set_camera_orientation(phi=65 * DEGREES, theta=-45 * DEGREES)
        elif mode == "bridge":
            remember("deck", Line([-6, -1, 0], [6, -1, 0], color=GREY))
            remember("leftTower", Line([-4, -2, 0], [-4, 2.5, 0], color=GREY))
            remember("rightTower", Line([4, -2, 0], [4, 2.5, 0], color=GREY))
            cable_points = [[x, .18*x*x-.4, 0] for x in np.linspace(-4, 4, 81)]
            remember("cable", VMobject(color=BLUE).set_points_smoothly(cable_points))
            for x in np.linspace(-4, 4, 17):
                self.add(Line([x, -1, 0], [x, .18*x*x-.4, 0], color=BLUE, stroke_width=1))
            remember("body", Rectangle(width=1.1, height=.4, color=GREEN, fill_opacity=.8).move_to([1, -.65, 0]))
            remember("wheelLeft", Circle(radius=.13, color=WHITE).move_to([.65, -.95, 0]))
            remember("wheelRight", Circle(radius=.13, color=WHITE).move_to([1.35, -.95, 0]))
            remember("weight", Arrow([1, -.6, 0], [1, -2.2, 0], color=ORANGE, buff=0))
            remember("weightLabel", Text("Weight = mg", font_size=22, color=ORANGE).move_to([2.3, -2, 0]))
            objects["car"] = VGroup(*[objects[k] for k in ("body", "wheelLeft", "wheelRight", "weight", "weightLabel")])
        elif mode == "mechanism":
            self.set_camera_orientation(phi=65*DEGREES, theta=-55*DEGREES)
            tracker = ValueTracker(0)
            crank = remember("crank", Cylinder(radius=.6, height=.16, resolution=(12, 12), color=BLUE))
            pin = remember("pin", Sphere(radius=.1, resolution=(8, 8), color=ORANGE))
            piston = remember("piston", Cube(side_length=.65, color=GREY))
            pin.add_updater(lambda m: m.move_to([.55*math.sin(tracker.get_value()), .55*math.cos(tracker.get_value()), .2]))
            piston.add_updater(lambda m: m.move_to([0, .55*math.cos(tracker.get_value())+math.sqrt(1.8**2-(.55*math.sin(tracker.get_value()))**2), .2]))
            rod = remember("rod", Line([0, .55, .2], [0, 2.35, .2], color=GREEN))
            rod.add_updater(lambda m: m.put_start_and_end_on(pin.get_center(), piston.get_center()))
            self.add(tracker)
        else:
            tracker = ValueTracker(0)
            terms = 1 if mode == "phasor" else spec["terms"]
            center = np.array([-3.8, 0, 0])
            def endpoints():
                p = center.copy()
                result = [p.copy()]
                for i in range(terms):
                    k = 2*i+1
                    radius = 1.5*spec.get("amplitude", 1) if mode == "phasor" else 1.1*spec.get("amplitude", 1)*4/(PI*k)
                    theta = k*(tracker.get_value()*spec.get("frequency", 1)+spec.get("phase", 0)*DEGREES)
                    p = p+radius*np.array([math.cos(theta), math.sin(theta), 0])
                    result.append(p.copy())
                return result
            for i in range(terms):
                radius = 1.5*spec.get("amplitude", 1) if mode == "phasor" else 1.1*spec.get("amplitude", 1)*4/(PI*(2*i+1))
                ring = Circle(radius=radius, color=GREY, stroke_opacity=.55)
                ring.add_updater(lambda m, i=i: m.move_to(endpoints()[i]))
                arrow = Arrow(ORIGIN, RIGHT, buff=0, color=BLUE, stroke_width=3)
                arrow.add_updater(lambda m, i=i: m.put_start_and_end_on(endpoints()[i], endpoints()[i+1]))
                remember("ring"+str(i), ring); remember("vector"+str(i), arrow)
            wave = VMobject(color=GREEN)
            def redraw_wave(m):
                time = tracker.get_value()
                points = []
                for x in np.linspace(0, min(time, TAU), 160):
                    angle = (time-x)*spec.get("frequency", 1)+spec.get("phase", 0)*DEGREES
                    y = 1.5*spec.get("amplitude", 1)*math.sin(angle) if mode == "phasor" else sum(1.1*spec.get("amplitude", 1)*4/(PI*(2*i+1))*math.sin((2*i+1)*angle) for i in range(terms))
                    points.append([-.3+x*.9, y, 0])
                m.set_points_as_corners(points)
            wave.add_updater(redraw_wave); remember("wave", wave)
            connector = Line(ORIGIN, RIGHT, color=ORANGE)
            connector.add_updater(lambda m: m.put_start_and_end_on(endpoints()[-1], [-.3, endpoints()[-1][1], 0]))
            remember("projection", connector); self.add(tracker)

        self.add_fixed_in_frame_mobjects(Text(spec["title"], font_size=24, color=WHITE).to_edge(UP))
        start_at = request.get("startAt", 0)
        for index, section in enumerate(spec["sections"]):
            self.next_section(section["id"], skip_animations=index < start_at)
            self.add_subcaption(section["cue"], duration=section["duration"])
            actions = section["actions"]
            if not actions and tracker is not None:
                self.play(tracker.animate.increment_value(TAU), run_time=section["duration"], rate_func=linear)
            elif not actions and mode == "bridge":
                self.play(objects["car"].animate.shift(LEFT*3), run_time=section["duration"])
            elif not actions:
                self.wait(section["duration"])
            for action in actions:
                target = objects[action["id"]]
                op, value = action["op"], action["value"]
                members = spec.get("groups", {}).get(action["id"], [action["id"]])
                changed.update(members)
                for member in members:
                    if op == "hide": hidden.add(member)
                    if op == "show": hidden.discard(member)
                    if op == "scale": scales[member] = scales.get(member, 1) * value
                    if op == "rotate": rotations[member] = rotations.get(member, 0) + value
                    if op == "text": text_values[member] = value
                if op == "move": anim = target.animate.move_to(vec(value))
                elif op == "shift": anim = target.animate.shift(vec(value))
                elif op == "scale": anim = target.animate.scale(value)
                elif op == "rotate": anim = target.animate.rotate(value*DEGREES)
                elif op == "recolor": anim = target.animate.set_color(value)
                elif op == "text":
                    replacement = (MathTypst(value, font_size=32) if action["id"] in math_ids else Text(value, font_size=24)).set_color(target.get_color()).move_to(target.get_center())
                    if replacement.width > 12: replacement.scale_to_fit_width(12)
                    anim = Transform(target, replacement)
                elif op == "hide": anim = target.animate.set_opacity(0)
                else: anim = target.animate.set_opacity(1)
                self.play(anim, run_time=section["duration"]/len(actions))

            if mode == "scene":
                snapshot = []
                for original in spec["objects"]:
                    name, kind = original["id"], original["kind"]
                    m = objects[name]
                    item = dict(original)
                    item.update(at=m.get_center().tolist(), color=m.get_color().to_hex(), visible=name not in hidden,
                                nativeChanged=name in changed, nativeRotation=rotations.get(name, 0))
                    if kind == "rect": item.update(width=float(m.width), height=float(m.height))
                    elif kind in ("circle", "dot"): item["radius"] = float(m.width)/2
                    elif kind == "arrow": item["points"] = [m.get_start().tolist(), m.get_end().tolist()]
                    elif kind == "line": item["points"] = [p.tolist() for p in m.get_start_anchors()] + [m.get_end().tolist()]
                    elif kind == "polygon": item["points"] = [p.tolist() for p in m.get_vertices()]
                    elif kind in ("text", "math"):
                        item["text"] = text_values[name]
                        item["nativeScale"] = scales.get(name, 1)
                    snapshot.append(item)
                states[section["id"]] = snapshot
        Path("scene-states.json").write_text(json.dumps(states), encoding="utf-8")
