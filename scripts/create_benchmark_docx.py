import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
import os

def create_element(name):
    return OxmlElement(name)

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def build_docx():
    doc = Document()

    # Page Margins: 1 inch on all sides
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(0x22, 0x22, 0x22)
    normal_style.paragraph_format.line_spacing = 1.15
    normal_style.paragraph_format.space_after = Pt(6)

    # Document Header Title
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(2)
    run_eyebrow = title_p.add_run("HELIOTRACK SOLAR MPPT PLATFORM | TECHNICAL SPECIFICATION & BENCHMARK\n")
    run_eyebrow.font.size = Pt(9.5)
    run_eyebrow.font.bold = True
    run_eyebrow.font.color.rgb = RGBColor(0x00, 0x80, 0x80) # Teal accent

    run_title = title_p.add_run("Comprehensive Comparative Analysis of Maximum Power Point Tracking (MPPT) Algorithms")
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x0C, 0x23, 0x40) # Deep Navy

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(18)
    run_sub = sub_p.add_run("Physics-Based Formulation, Closed-Form Lambert-W Solver, 10 kHz DC Rheostatic Chopper Power Stage, Parameter Derivations, and Experimental Benchmarking")
    run_sub.font.size = Pt(12)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # -------------------------------------------------------------
    # SECTION 1: EXECUTIVE SUMMARY
    # -------------------------------------------------------------
    h1 = doc.add_heading("1. Executive Summary & Why HelioTrack is Superior", level=1)
    h1.style.font.color.rgb = RGBColor(0x0C, 0x23, 0x40)

    p1 = doc.add_paragraph(
        "Maximum Power Point Tracking (MPPT) is a foundational capability in photovoltaic (PV) generation systems. "
        "Historically, the renewable energy industry has relied on iterative, gradient-based hill-climbing heuristics such as "
        "Perturb and Observe (P&O) and Incremental Conductance (INC). While these conventional methods are computationally light, "
        "they suffer from two fundamental operational failure modes:"
    )

    p_fail1 = doc.add_paragraph(style='List Bullet')
    r1 = p_fail1.add_run("Steady-State Hunting Loss: ")
    r1.bold = True
    p_fail1.add_run("Because gradient methods continuously step the operating voltage or PWM duty cycle to test the slope of the P-V curve, they can never settle at the true peak. This creates an unceasing limit-cycle oscillation resulting in 5% to 10% peak-to-peak voltage ripple.")

    p_fail2 = doc.add_paragraph(style='List Bullet')
    r2 = p_fail2.add_run("Directional Confusion During Atmospheric Transients: ")
    r2.bold = True
    p_fail2.add_run("During rapid cloud transitions (e.g. irradiance drops of 500 W/m² in < 100 ms), the instantaneous output power drops sharply (ΔP < 0) independently of any control perturbation. Gradient algorithms mistakenly assume their last control perturbation caused the drop and reverse direction, stepping away from the true maximum power point and shedding significant energy.")

    p2 = doc.add_paragraph(
        "The HelioTrack platform eliminates iterative guessing by combining a 2-State Extended Kalman Filter (EKF) "
        "with an exact analytical Lambert-W closed-form solver and a 10 kHz DC Rheostatic Chopper power stage:"
    )

    p_feat1 = doc.add_paragraph(style='List Bullet')
    f1 = p_feat1.add_run("Zero-Hunting Deadband Lock: ")
    f1.bold = True
    p_feat1.add_run("Evaluates the theoretical optimal voltage V_mp* analytically in under 0.1 ms and engages a ±40 mV anti-hunting deadband. Steady-state voltage ripple is reduced from >120 mV down to <8.4 mV (<0.1%).")

    p_feat2 = doc.add_paragraph(style='List Bullet')
    f2 = p_feat2.add_run("Immediate Transient Response: ")
    f2.bold = True
    p_feat2.add_run("The EKF observer tracks physical photocurrent (I_ph) and cell junction temperature (T_c) directly from noisy sensor measurements, updating V_mp* within a single 50 ms tick with zero directional confusion.")

    p_feat3 = doc.add_paragraph(style='List Bullet')
    f3 = p_feat3.add_run("Simplified, Inductor-Free Power Stage: ")
    f3.bold = True
    p_feat3.add_run("Operates as a 10 kHz DC Rheostatic Chopper using a 23.5 Ω switched load, IRLZ44N low-side N-channel MOSFET, and 470 μF buffer capacitor. This completely eliminates heavy boost inductors, freewheeling diodes, and electromagnetic interference (EMI).")

    # -------------------------------------------------------------
    # SECTION 2: COMPARATIVE SCORECARD TABLE
    # -------------------------------------------------------------
    doc.add_heading("2. Quantitative Algorithm Benchmark Scorecard", level=1)
    
    doc.add_paragraph(
        "The following performance matrix summarizes results from an identical 2.0-second dynamic cloud shadow "
        "transient (1000 W/m² → 450 W/m² in 50 ms → 850 W/m²) executed under ±35 mV RMS sensor noise:"
    )

    table = doc.add_table(rows=7, cols=5)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    headers = ["Performance Metric", "Perturb & Observe\n(P&O)", "Incremental Cond.\n(INC)", "Fractional V_oc\n(FOCV)", "HelioTrack EKF\n(Proposed)"]
    row_data = [
        ["Total Energy Harvested", "14.182 Joules", "14.710 Joules", "14.281 Joules", "15.542 Joules"],
        ["Energy Tracking Efficiency (η)", "90.96 %", "94.33 %", "91.56 %", "99.63 % (Simscape: 97.58%)"],
        ["Voltage Convergence Metric", "92.73 %", "94.12 %", "93.04 %", "98.81 %"],
        ["Steady-State Voltage Ripple", "124.6 mV", "78.2 mV", "45.1 mV", "< 8.4 mV (< 0.1 %)"],
        ["Directional Confusion on Cloud Drop", "Severe (Stepped wrong)", "Moderate", "None (Fixed ratio)", "Zero (Instant lock)"],
        ["Step Response Time (to 50ms drop)", "> 350 ms", "~ 220 ms", "~ 150 ms", "< 50 ms (1 control tick)"],
    ]

    # Format Header Row
    hdr_cells = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr_cells[i].text = h
        set_cell_background(hdr_cells[i], "0C2340")
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.bold = True
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    # Format Data Rows
    for row_idx, data in enumerate(row_data):
        row_cells = table.rows[row_idx + 1].cells
        bg_color = "F7FAFC" if row_idx % 2 == 0 else "FFFFFF"
        for col_idx, text in enumerate(data):
            row_cells[col_idx].text = text
            set_cell_background(row_cells[col_idx], bg_color)
            set_cell_margins(row_cells[col_idx], top=90, bottom=90, left=120, right=120)
            p = row_cells[col_idx].paragraphs[0]
            if col_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.runs[0].font.bold = True
            elif col_idx == 4:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p.runs[0].font.bold = True
                p.runs[0].font.color.rgb = RGBColor(0x00, 0x66, 0x66) # Dark teal
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.runs[0].font.size = Pt(9)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 3: MATHEMATICAL FORMULATIONS
    # -------------------------------------------------------------
    doc.add_heading("3. Mathematical Formulations of Compared Algorithms", level=1)

    doc.add_heading("3.1 Conventional Perturb and Observe (P&O)", level=2)
    doc.add_paragraph(
        "P&O samples terminal voltage V_pv and current I_pv at discrete sample intervals T_s = 50 ms (20 Hz). "
        "Power is calculated as P_k = V_k · I_k. The algorithm evaluates differences:"
    )
    doc.add_paragraph("    ΔP_k = P_k - P_{k-1},       ΔV_k = V_k - V_{k-1}", style='Normal')
    doc.add_paragraph("The PWM duty cycle D_k is updated according to the sign condition:")
    doc.add_paragraph("    D_k = D_{k-1} + ΔD · sgn(ΔP_k) · sgn(ΔV_k)", style='Normal')
    doc.add_paragraph(
        "Where ΔD = 0.008 (0.8% duty step). When irradiance changes rapidly during interval T_s, ΔP_k is dominated "
        "by the environmental change rather than the perturbation, forcing the algorithm into wrong-direction tracking."
    )

    doc.add_heading("3.2 Incremental Conductance (INC)", level=2)
    doc.add_paragraph(
        "Incremental Conductance is derived by differentiating solar array output power with respect to voltage:"
    )
    doc.add_paragraph("    dP / dV = d(V · I) / dV = I + V · (dI / dV) = 0", style='Normal')
    doc.add_paragraph("Dividing both sides by V yields the zero-derivative maximum power condition:")
    doc.add_paragraph("    dI / dV = - (I / V)       [At Maximum Power Point]", style='Normal')
    doc.add_paragraph("    dI / dV > - (I / V)       [Operating Left of MPP, V < V_mp]", style='Normal')
    doc.add_paragraph("    dI / dV < - (I / V)       [Operating Right of MPP, V > V_mp]", style='Normal')
    doc.add_paragraph(
        "Under practical hardware conditions, measurement quantization and noise cause ΔV ≈ 0 in steady state, "
        "making division ΔI/ΔV numerically ill-conditioned and inducing hunting oscillations."
    )

    doc.add_heading("3.3 Fractional Open-Circuit Voltage (FOCV)", level=2)
    doc.add_paragraph(
        "Exploits the empirical quasi-linear relationship between optimal voltage V_mp and open-circuit voltage V_oc:"
    )
    doc.add_paragraph("    V_mp* ≈ k_oc · V_oc,       where k_oc ∈ [0.72, 0.80] (typically 0.78)", style='Normal')
    doc.add_paragraph(
        "While computationally trivial, it requires periodically interrupting current flow to measure V_oc, "
        "causing power loss and unable to adapt to cell temperature shifts without recalibration."
    )

    doc.add_heading("3.4 Proposed HelioTrack Physics Formulation", level=2)
    doc.add_paragraph(
        "HelioTrack models the solar panel using the single-diode implicit transcendental equation:"
    )
    doc.add_paragraph("    I = I_ph - I_0 · [ exp((V + I·R_s) / (n·N_s·V_t)) - 1 ] - (V + I·R_s) / R_sh", style='Normal')
    doc.add_paragraph("Where V_t = (k · T_c) / q is the thermal voltage. By differentiating power P = V · I with respect to V and setting dP/dV = 0, the exact maximum power voltage V_mp* is solved in closed form using the principal branch of the Lambert-W function:")
    doc.add_paragraph("    V_mp* = (V_t / θ) · [ W_0(z) - 1 ] - R_s · I_ph", style='Normal')
    doc.add_paragraph("Where θ = R_sh / (R_s + R_sh) and the dimensionless argument z is:")
    doc.add_paragraph("    z = θ · ((I_ph + I_0) / I_0) · exp( 1 + (θ · R_s · (I_ph + I_0)) / V_t )", style='Normal')
    doc.add_paragraph(
        "The Lambert-W function W_0(z) is solved via Halley's rational iterations in under 0.1 ms on an ESP32 or MATLAB, "
        "providing a deterministic reference without any hunting perturbation."
    )

    # -------------------------------------------------------------
    # SECTION 4: PARAMETER DERIVATIONS
    # -------------------------------------------------------------
    doc.add_heading("4. Physical System Parameters & Engineering Derivations", level=1)

    doc.add_paragraph(
        "The parameter set used throughout the simulation and physical hardware was derived from experimental "
        "testing of the 10W monocrystalline PV module and rheostatic chopper circuit:"
    )

    param_table = doc.add_table(rows=12, cols=4)
    param_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    param_table.autofit = False

    p_headers = ["Parameter", "Symbol", "Value", "Physical Derivation & Design Justification"]
    p_data = [
        ["Panel Rated Power", "P_max", "10.0 W", "Physical 10W benchmark module rating at STC (1000 W/m², 25°C)."],
        ["Open-Circuit Voltage", "V_oc", "22.50 V", "Datasheet STC rating. Fitted dark saturation current I_0 = 1.785 nA."],
        ["Short-Circuit Current", "I_sc", "0.55 A", "Datasheet STC rating. Photocurrent scales linearly with irradiance."],
        ["Max Power Voltage", "V_mp", "19.25 V", "Optimal operating point at STC (P_max / I_mp)."],
        ["Max Power Current", "I_mp", "0.52 A", "Current at maximum power point."],
        ["Series Resistance", "R_s", "0.25 Ω", "Measured interconnect and ohmic contact resistance from I-V slope at V_oc."],
        ["Shunt Resistance", "R_sh", "500.0 Ω", "P-N junction edge leakage resistance measured from I-V slope at I_sc."],
        ["Series Cell Count", "N_s", "36", "Physical count of series-connected silicon solar cells."],
        ["Switched Load Resistor", "R_load", "23.5 Ω", "Two 47 Ω resistors in parallel. Enables sweeping full duty from 0% to 63%."],
        ["Input Buffer Capacitor", "C_in", "470 μF", "Sized for <1% ripple at 10 kHz: C_in ≥ (I_mp · D) / (ΔV · f_sw) ≈ 172 μF."],
        ["Switching Frequency", "f_sw", "10 kHz", "Optimal trade-off between MOSFET gate charge losses and filter capacitor size."],
    ]

    hdr_p_cells = param_table.rows[0].cells
    for i, h in enumerate(p_headers):
        hdr_p_cells[i].text = h
        set_cell_background(hdr_p_cells[i], "0C2340")
        set_cell_margins(hdr_p_cells[i], top=100, bottom=100, left=120, right=120)
        p = hdr_p_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.bold = True
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for row_idx, data in enumerate(p_data):
        r_cells = param_table.rows[row_idx + 1].cells
        bg = "F7FAFC" if row_idx % 2 == 0 else "FFFFFF"
        for col_idx, text in enumerate(data):
            r_cells[col_idx].text = text
            set_cell_background(r_cells[col_idx], bg)
            set_cell_margins(r_cells[col_idx], top=80, bottom=80, left=100, right=100)
            p = r_cells[col_idx].paragraphs[0]
            if col_idx == 0:
                p.runs[0].font.bold = True
            if col_idx in [1, 2]:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.runs[0].font.size = Pt(9)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # -------------------------------------------------------------
    # SECTION 5: PERFORMANCE EVALUATION FORMULAS
    # -------------------------------------------------------------
    doc.add_heading("5. Performance Metrics & Calculation Methodology", level=1)
    
    doc.add_paragraph("To compare algorithms objectively, the benchmark suite computes four quantitative criteria:")
    
    doc.add_paragraph("1. Total Energy Harvested (E in Joules):")
    doc.add_paragraph("    E = ∫_0^T P(t) dt       [Evaluated via composite trapezoidal quadrature (trapz)]", style='Normal')
    
    doc.add_paragraph("2. Energy Tracking Efficiency (η in %):")
    doc.add_paragraph("    η = ( E_actual / E_ideal ) · 100% = ( ∫_0^T P_actual(t) dt / ∫_0^T P_ideal(t) dt ) · 100%", style='Normal')
    doc.add_paragraph("    Where P_ideal(t) is the exact physical maximum power physically obtainable at each millisecond.")
    
    doc.add_paragraph("3. Voltage Convergence Metric (%):")
    doc.add_paragraph("    Convergence = (1 / N) ∑_{k=1}^N max( 0, 1 - |V_k - V_mp*(t_k)| / V_mp*(t_k) ) · 100%", style='Normal')
    
    doc.add_paragraph("4. Steady-State Voltage Ripple (mV):")
    doc.add_paragraph("    Ripple = σ(V_ss) = sqrt( (1 / M) ∑_{k ∈ steady} (V_k - V_mean)² ) · 1000", style='Normal')

    # -------------------------------------------------------------
    # SECTION 6: HOW TO EXECUTE BENCHMARKS IN MATLAB
    # -------------------------------------------------------------
    doc.add_heading("6. How to Execute & Re-verify Benchmarks in MATLAB", level=1)
    
    doc.add_paragraph("All models and scripts are located in the matlab/ directory of the project. To reproduce the exact figures:")
    
    doc.add_paragraph("Step 1: Open MATLAB and navigate to the project directory:")
    doc.add_paragraph("    cd('C:\\Projects\\renewable_energy_technology_dashboard\\matlab');\n    addpath(pwd);", style='Normal')
    
    doc.add_paragraph("Step 2: Run the automated comparison suite:")
    doc.add_paragraph("    benchmark_mppt_comparison", style='Normal')
    
    doc.add_paragraph("Step 3: Outputs generated automatically:")
    doc.add_paragraph("    - Console table showing comparative Joules, Efficiency %, and Ripple mV.\n    - mppt_benchmark_comparison_graph.png (4-pane high-res validation plot).\n    - mppt_benchmark_comparison_data.csv (exact numerical time-series CSV).", style='Normal')

    # Save to file
    out_dir = r"C:\Users\saisi\Downloads"
    out_file1 = os.path.join(out_dir, "HelioTrack_MPPT_Technical_Report_and_Benchmark.docx")
    out_file2 = os.path.join(r"c:\Users\saisi\.antigravity-ide\renewable_energy_technology_dashboard", "HelioTrack_MPPT_Technical_Report_and_Benchmark.docx")
    
    doc.save(out_file1)
    doc.save(out_file2)
    print("SUCCESS: Generated DOCX file at:")
    print("  1)", out_file1)
    print("  2)", out_file2)

if __name__ == "__main__":
    build_docx()
