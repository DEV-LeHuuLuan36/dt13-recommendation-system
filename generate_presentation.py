import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def build_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Colors
    BG_PAGE = RGBColor(248, 250, 252)       # #F8FAFC
    CARD_BG = RGBColor(255, 255, 255)       # #FFFFFF
    BORDER_COLOR = RGBColor(226, 232, 240)  # #E2E8F0
    TEXT_MAIN = RGBColor(15, 23, 42)        # #0F172A
    TEXT_MUTED = RGBColor(71, 85, 105)      # #475569
    TEXT_LIGHT = RGBColor(100, 116, 139)    # #64748B
    
    PRIMARY_GREEN = RGBColor(5, 150, 105)   # Neo4j Emerald #059669
    PRIMARY_BLUE = RGBColor(37, 99, 235)    # Tech Blue #2563EB
    PRIMARY_AMBER = RGBColor(217, 119, 6)   # Warm Amber #D97706
    PRIMARY_DARK = RGBColor(30, 41, 59)     # Deep Slate #1E293B

    IMG_DIR = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/extracted_pptx_images"
    USER_IMG = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794809277696_dccfce01.jpg"

    def set_slide_background(slide, color=BG_PAGE):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = color
        bg.line.fill.background()
        return bg

    def add_header(slide, badge_text, title_text, subtitle_text=None, badge_color=PRIMARY_GREEN):
        # Badge
        badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(0.5), Inches(3.2), Inches(0.38))
        badge.fill.solid()
        badge.fill.fore_color.rgb = badge_color
        badge.line.fill.background()
        tf = badge.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = badge_text.upper()
        p.font.name = "Segoe UI"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = RGBColor(255, 255, 255)
        p.alignment = PP_ALIGN.CENTER

        # Main Title
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.95), Inches(11.7), Inches(0.6))
        tf_title = tb.text_frame
        tf_title.word_wrap = True
        tf_title.margin_left = tf_title.margin_right = tf_title.margin_top = tf_title.margin_bottom = 0
        p_title = tf_title.paragraphs[0]
        p_title.text = title_text
        p_title.font.name = "Segoe UI"
        p_title.font.size = Pt(22)
        p_title.font.bold = True
        p_title.font.color.rgb = TEXT_MAIN

        # Subtitle
        if subtitle_text:
            p_sub = tf_title.add_paragraph()
            p_sub.text = subtitle_text
            p_sub.font.name = "Segoe UI"
            p_sub.font.size = Pt(12)
            p_sub.font.color.rgb = TEXT_MUTED
            p_sub.space_before = Pt(3)

    def add_card(slide, left, top, width, height, title, body_bullets=None, header_color=TEXT_MAIN, bg=CARD_BG, border=BORDER_COLOR):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = bg
        card.line.color.rgb = border
        card.line.width = Pt(1.2)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_right = Inches(0.25)
        tf.margin_top = Inches(0.25)
        tf.margin_bottom = Inches(0.2)

        if title:
            p = tf.paragraphs[0]
            p.text = title
            p.font.name = "Segoe UI"
            p.font.size = Pt(14)
            p.font.bold = True
            p.font.color.rgb = header_color
            p.space_after = Pt(8)

        if body_bullets:
            for i, b in enumerate(body_bullets):
                p_b = tf.add_paragraph() if (title or i > 0) else tf.paragraphs[0]
                p_b.text = b
                p_b.font.name = "Segoe UI"
                p_b.font.size = Pt(11)
                p_b.font.color.rgb = TEXT_MUTED
                p_b.space_after = Pt(6)
        return card

    def add_stat_card(slide, left, top, width, height, number_str, label_str, sub_label=None, num_color=PRIMARY_GREEN):
        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(width), Inches(height))
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = BORDER_COLOR
        card.line.width = Pt(1.2)
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = Inches(0.2)
        tf.margin_top = Inches(0.2)

        p_num = tf.paragraphs[0]
        p_num.text = number_str
        p_num.font.name = "Segoe UI"
        p_num.font.size = Pt(32)
        p_num.font.bold = True
        p_num.font.color.rgb = num_color
        p_num.alignment = PP_ALIGN.CENTER

        p_lbl = tf.add_paragraph()
        p_lbl.text = label_str
        p_lbl.font.name = "Segoe UI"
        p_lbl.font.size = Pt(12)
        p_lbl.font.bold = True
        p_lbl.font.color.rgb = TEXT_MAIN
        p_lbl.alignment = PP_ALIGN.CENTER
        p_lbl.space_before = Pt(4)

        if sub_label:
            p_sub = tf.add_paragraph()
            p_sub.text = sub_label
            p_sub.font.name = "Segoe UI"
            p_sub.font.size = Pt(10)
            p_sub.font.color.rgb = TEXT_LIGHT
            p_sub.alignment = PP_ALIGN.CENTER

    def add_speaker_note(slide, text):
        notes_slide = slide.notes_slide
        tf = notes_slide.notes_text_frame
        tf.text = text

    # ==========================================
    # SLIDE 1: TRANG BÌA
    # ==========================================
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1, PRIMARY_DARK)

    # University header
    tb = s1.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.3), Inches(0.6))
    p = tb.text_frame.paragraphs[0]
    p.text = "TRƯỜNG ĐẠI HỌC CÔNG THƯƠNG TP. HỒ CHÍ MINH (HUIT) • KHOA CÔNG NGHỆ THÔNG TIN"
    p.font.name = "Segoe UI"
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = RGBColor(148, 163, 184)

    # Title
    tb = s1.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.3), Inches(1.6))
    p = tb.text_frame.paragraphs[0]
    p.text = "HỆ THỐNG GỢI Ý SẢN PHẨM TƯƠNG QUAN"
    p.font.name = "Segoe UI"
    p.font.size = Pt(32)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)

    p_sub = tb.text_frame.add_paragraph()
    p_sub.text = "Mô Hình Gợi Ý Lai (Hybrid Recommendation System) Trên Cơ Sở Dữ Liệu Đồ Thị Neo4j"
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(16)
    p_sub.font.color.rgb = RGBColor(52, 211, 153) # Mint green
    p_sub.space_before = Pt(8)

    # Divider line
    div = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1.0), Inches(3.4), Inches(11.3), Inches(0.04))
    div.fill.solid()
    div.fill.fore_color.rgb = PRIMARY_GREEN
    div.line.fill.background()

    # Team & Teacher info
    tb_team = s1.shapes.add_textbox(Inches(1.0), Inches(3.8), Inches(5.5), Inches(2.6))
    tf = tb_team.text_frame
    p = tf.paragraphs[0]
    p.text = "SINH VIÊN THỰC HIỆN: NHÓM DT13"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)

    members = [
        "1. Lê Hữu Luân (Trưởng nhóm) - 2001230482",
        "2. Nguyễn Kiều Hạnh Nguyên - 2001230588",
        "3. Nguyễn Anh Tuấn - 2001230847"
    ]
    for m in members:
        pm = tf.add_paragraph()
        pm.text = m
        pm.font.name = "Segoe UI"
        pm.font.size = Pt(12)
        pm.font.color.rgb = RGBColor(203, 213, 225)
        pm.space_before = Pt(6)

    tb_t = s1.shapes.add_textbox(Inches(7.2), Inches(3.8), Inches(5.1), Inches(2.6))
    tf_t = tb_t.text_frame
    p = tf_t.paragraphs[0]
    p.text = "GIẢNG VIÊN HƯỚNG DẪN:"
    p.font.name = "Segoe UI"
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)

    pt = tf_t.add_paragraph()
    pt.text = "TS. Trần Quang Bình"
    pt.font.name = "Segoe UI"
    pt.font.size = Pt(15)
    pt.font.bold = True
    pt.font.color.rgb = RGBColor(52, 211, 153)
    pt.space_before = Pt(6)

    pt2 = tf_t.add_paragraph()
    pt2.text = "Bộ môn Hệ thống Thông tin & Dữ liệu lớn\nKhoa Công nghệ Thông tin - HUIT"
    pt2.font.name = "Segoe UI"
    pt2.font.size = Pt(11)
    pt2.font.color.rgb = RGBColor(203, 213, 225)
    pt2.space_before = Pt(4)

    add_speaker_note(s1, 
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Kính chào Thầy Cô trong Hội đồng và các bạn sinh viên.\n"
        "- Em là Lê Hữu Luân, đại diện nhóm DT13 gồm 3 thành viên: Luân, Nguyên và Tuấn.\n"
        "- Hôm nay nhóm em xin phép được báo cáo đề tài Đồ án môn học: 'Hệ thống gợi ý sản phẩm tương quan - Hybrid Recommendation System trên cơ sở dữ liệu đồ thị Neo4j' dưới sự hướng dẫn của TS. Trần Quang Bình.\n"
        "- Sau đây em xin bắt đầu phần trình bày."
    )

    # ==========================================
    # SLIDE 2: MỤC LỤC / TỔNG QUAN
    # ==========================================
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_background(s2)
    add_header(s2, "Nội Dung Báo Cáo", "Tổng Quan Hành Trình Đồ Án", "4 trụ cột cốt lõi từ bài toán, thiết kế đồ thị, giải thuật đến triển khai thực tế")

    cards_agenda = [
        ("01. BÀI TOÁN & NEO4J", ["• Quá tải thông tin trong E-Commerce", "• Điểm nghẽn JOIN 4 bảng của RDBMS", "• Đột phá Index-Free Adjacency O(k)", "• Tập dữ liệu thực tế: 150 SP, 65 Khách"], PRIMARY_BLUE),
        ("02. THIẾT KẾ ĐỒ THỊ", ["• 5 Nhãn Node & 7 Quan hệ cốt lõi", "• 8 Uniqueness Constraints O(1)", "• Toàn vẹn dữ liệu: Chặn cascade delete", "• Idempotency replay & Snapshot giá"], PRIMARY_GREEN),
        ("03. CÁC GIẢI THUẬT GỢI Ý", ["• User-based Collaborative Filtering", "• Đa hành vi có trọng số (Mua x3, Xem x1)", "• Serendipity & Mua chéo Cross-Category", "• Động cơ lai Hybrid 7 tầng & Parser tiếng Việt"], PRIMARY_AMBER),
        ("04. TRIỂN KHAI & HIỆU NĂNG", ["• Kiến trúc 3 tầng: React + Express + Neo4j", "• Bảng tin gợi ý 5 bộ lọc & Drawer Cypher", "• Admin Console đồ thị D3 & Offline Eval", "• Đo lường PROFILE/EXPLAIN chỉ 386 DbHits"], PRIMARY_DARK)
    ]

    for idx, (title, bullets, color) in enumerate(cards_agenda):
        left = 0.8 + idx * 2.95
        add_card(s2, left, 1.8, 2.8, 5.0, title, bullets, header_color=color)

    add_speaker_note(s2,
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Bài báo cáo của nhóm được cô đọng trong 4 phần rõ ràng:\n"
        "1. Đầu tiên là Lý do bài toán gợi ý bắt buộc phải dùng Graph Database thay vì SQL truyền thống.\n"
        "2. Thứ hai là Thiết kế mô hình đồ thị và các ràng buộc toàn vẹn dữ liệu trên Neo4j.\n"
        "3. Thứ ba là 4 Thuật toán gợi ý cốt lõi và câu lệnh Cypher tương ứng mà nhóm đã cài đặt.\n"
        "4. Cuối cùng là Kiến trúc hệ thống, Giao diện thực tế, Đo lường hiệu năng chuyên sâu và phần Live Demo."
    )

    # ==========================================
    # SLIDE 3: BỐI CẢNH & TẠI SAO CHỌN NEO4J?
    # ==========================================
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_background(s3)
    add_header(s3, "Bối Cảnh & Đặt Vấn Đề", "Tại Sao Chọn Neo4j Thay Vì RDBMS Truyền Thống?", "Giải quyết điểm nghẽn JOIN nhiều bảng khi quy mô dữ liệu mở rộng")

    add_card(s3, 0.8, 1.8, 5.7, 5.1, "Hạn Chế Của CSDL Quan Hệ (RDBMS)", [
        "❌ Quá tải thông tin (Information Overload): Khách hàng bị ngợp giữa hàng ngàn sản phẩm, cần gợi ý cá nhân hóa chính xác.",
        "❌ Điểm nghẽn JOIN liên bảng: Để tìm 'Khách mua sản phẩm tương tự bạn', SQL phải JOIN qua 4 bảng lớn:",
        "    Customers ⨝ Orders ⨝ Order_Items ⨝ Products",
        "❌ Chi phí bùng nổ theo cấp số nhân: Khi số lượng giao dịch tăng lên hàng triệu bản ghi, câu lệnh SQL bị nghẽn (Query Timeout), không thể phản hồi thời gian thực.",
        "❌ Lược đồ cứng nhắc: Thêm quan hệ hành vi mới (Xem, Tìm kiếm, Đã ẩn) phải ALTER TABLE phức tạp."
    ], header_color=RGBColor(220, 38, 38))

    add_card(s3, 6.8, 1.8, 5.7, 5.1, "Đột Phá Của CSDL Đồ Thị Neo4j", [
        "✅ Duyệt liền kề Index-Free (Index-Free Adjacency): Mỗi Node lưu trữ trực tiếp con trỏ vật lý tới các Node lân cận.",
        "✅ Tốc độ độc lập kích thước CSDL: Độ phức tạp duyệt chỉ phụ thuộc số bậc liên kết k: O(k), dù database có 100 ngàn hay 100 triệu nút.",
        "✅ Khớp mẫu tự nhiên bằng Cypher:",
        "    MATCH (c1)-[:BOUGHT]->(p)<-[:BOUGHT]-(c2)-[:BOUGHT]->(reco)",
        "    Trực quan, mô phỏng đúng tư duy mạng xã hội & hành vi mua sắm.",
        "✅ Lược đồ linh hoạt (Schema-flexible): Dễ dàng bổ sung các hành vi [:VIEWED], [:SEARCHED] mà không gián đoạn hệ thống."
    ], header_color=PRIMARY_GREEN)

    # If image exists, place small preview
    img_path = os.path.join(IMG_DIR, "slide_03_img_11_0.png")
    if os.path.exists(img_path):
        # We can add an image callout at bottom if needed
        pass

    add_speaker_note(s3,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy, trong các bài toán gợi ý thương mại điện tử, câu hỏi thường gặp nhất là: 'Người mua sản phẩm A cũng mua sản phẩm B nào khác?'.\n"
        "- Nếu giải bằng SQL truyền thống, chúng ta phải JOIN 4 bảng: Customers với Orders, Orders với Order_Items, rồi mới tới Products. Khi dữ liệu lớn, chi phí quét index và nối bảng tăng theo hàm mũ, dẫn tới nghẽn hệ thống.\n"
        "- Ngược lại, Neo4j sử dụng cơ chế Index-Free Adjacency: mỗi nút giữ con trỏ bộ nhớ tới các nút kề nó. Tốc độ duyệt chỉ phụ thuộc vào số liên kết k chứ hoàn toàn không phụ thuộc vào kích thước toàn bộ CSDL. Nhờ đó, Neo4j đạt tốc độ phản hồi tính bằng mili-giây, cực kỳ lý tưởng cho hệ gợi ý thời gian thực."
    )

    # ==========================================
    # SLIDE 4: PHẠM VI HỆ THỐNG & DỮ LIỆU THỰC TẾ
    # ==========================================
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_background(s4)
    add_header(s4, "Quy Mô Đồ Thị", "Tập Dữ Liệu Bán Lẻ Thực Tế Từ CellphoneS", "Dữ liệu thực tế chuẩn hóa đa ngành hàng với hàng trăm giao dịch đan xen")

    add_stat_card(s4, 0.8, 1.8, 3.6, 1.9, "150", "Sản phẩm công nghệ", "CellphoneS (Laptop, Phone, Phụ kiện)", PRIMARY_BLUE)
    add_stat_card(s4, 4.8, 1.8, 3.6, 1.9, "65", "Khách hàng định danh", "63 tài khoản User + 2 Admin quản trị", PRIMARY_GREEN)
    add_stat_card(s4, 8.8, 1.8, 3.7, 1.9, "903+", "Quan hệ đồ thị", "382 BOUGHT + 371 VIEWED + 150 BELONGS", PRIMARY_AMBER)

    add_card(s4, 0.8, 4.0, 5.7, 2.9, "6 Ngành Hàng Đa Dạng Chuẩn E-Commerce", [
        "• RC_CAT_LAPTOP: Laptop Gaming, Văn phòng (Lenovo, Dell, ASUS, Mac)",
        "• RC_CAT_SMARTPHONE: Điện thoại Flagship & Phổ thông (iPhone, Samsung)",
        "• RC_CAT_HEADPHONES: Tai nghe True Wireless, Chống ồn (Sony, JBL)",
        "• RC_CAT_MOUSE: Chuột Bluetooth, Gaming không dây (Logitech, Razer)",
        "• RC_CAT_KEYBOARD: Bàn phím cơ công thái học (Keychron, Akko)",
        "• RC_CAT_ACCESSORIES: Củ sạc nhanh, Cáp sạc, Balo chống sốc"
    ], header_color=PRIMARY_BLUE)

    add_card(s4, 6.8, 4.0, 5.7, 2.9, "Ý Nghĩa Của Tập Dữ Liệu Đối Với Thuật Toán", [
        "• Đầy đủ ma trận tương quan: Các liên kết BOUGHT đan xen tạo thành mạng lưới 'mua chung' (Co-bought) dày đặc.",
        "• Đa hành vi (Multi-behavior): Mỗi khách hàng có cả lịch sử Mua và Xem, cung cấp dữ liệu dồi dào cho thuật toán Collaborative Filtering.",
        "• Phục vụ gợi ý chéo: Quan hệ thiết bị chính (Laptop/Điện thoại) và phụ kiện (Chuột/Tai nghe) làm cơ sở cho thuật toán Cross-Category.",
        "• Vượt xa yêu cầu học phần: Yêu cầu chuẩn >100 SP, >50 User; nhóm đã triển khai 150 SP, 65 User và gần 1000 quan hệ."
    ], header_color=PRIMARY_GREEN)

    add_speaker_note(s4,
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Để kiểm chứng các giải thuật một cách thực tế, nhóm đã trích xuất tập dữ liệu 150 sản phẩm công nghệ thật từ hệ thống CellphoneS, chia thành 6 ngành hàng.\n"
        "- Toàn bộ đồ thị gồm 65 khách hàng, phát sinh hơn 382 lượt mua hàng, 371 lượt xem và 150 liên kết ngành hàng.\n"
        "- Điểm quan trọng là các hành vi mua hàng được nhóm thiết kế đan xen có chủ đích giữa các nhóm người dùng: có nhóm thích hệ sinh thái Apple, nhóm thích Laptop Gaming, nhóm văn phòng... Điều này tạo ra cấu trúc cụm đồ thị rõ ràng để thuật toán Collaborative Filtering phát huy tối đa sức mạnh."
    )

    # ==========================================
    # SLIDE 5: THIẾT KẾ MÔ HÌNH ĐỒ THỊ & RÀNG BUỘC
    # ==========================================
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_background(s5)
    add_header(s5, "Mô Hình Dữ Liệu", "Graph Schema & 8 Ràng Buộc Toàn Vẹn Trên Neo4j", "Thiết kế chuẩn hóa Node Labels, Relationship Types và quy tắc an toàn dữ liệu")

    add_card(s5, 0.8, 1.8, 3.6, 5.1, "5 Node Labels Chính", [
        "👤 :Customer",
        "  customerId (PK), email, name, role (customer/admin), active, passwordHash",
        "",
        "📦 :Product",
        "  productId (PK), name, price, brand, model, active, imageUrl",
        "",
        "🏷️ :Category",
        "  categoryId (PK), name, description",
        "",
        "🌐 :GuestSession",
        "  guestId (PK), lastSeenAt (phục vụ khách vãng lai)",
        "",
        "🔍 :SearchEvent",
        "  eventId, query, intentJson, createdAt (TTL 30 ngày)"
    ], header_color=PRIMARY_DARK)

    add_card(s5, 4.7, 1.8, 3.6, 5.1, "7 Relationship Types", [
        "[:BELONGS_TO]",
        "  Product -> Category (Mỗi SP thuộc đúng 1 danh mục)",
        "",
        "[:BOUGHT]",
        "  Customer -> Product (eventId, unitPrice snapshot, quantity, createdAt)",
        "",
        "[:VIEWED]",
        "  Customer/Guest -> Product (Lưu vết xem thời gian thực)",
        "",
        "[:SEARCHED]",
        "  Lịch sử tìm kiếm gắn theo phiên",
        "",
        "[:IMPRESSED] & [:DISMISSED]",
        "  Ghi nhận lượt hiển thị và phản hồi ẩn/hoàn tác gợi ý"
    ], header_color=PRIMARY_GREEN)

    add_card(s5, 8.6, 1.8, 3.9, 5.1, "8 Constraints & Ràng Buộc", [
        "🔒 8 Unique Constraints O(1):",
        "  Khởi tạo tự động qua npm run db:schema:",
        "  • Customer(customerId), Customer(email)",
        "  • Product(productId), Category(categoryId)",
        "  • GuestSession(guestId), SearchEvent(eventId)",
        "  -> Đảm bảo truy xuất O(1) qua NodeIndexSeek.",
        "",
        "🛡️ Quy tắc toàn vẹn nghiệp vụ:",
        "  • Chống xóa Cascade: Không xóa SP/User đã có lịch sử BOUGHT/VIEWED (chặn bằng HTTP 409).",
        "  • Snapshot đơn giá: Ghi cố định product.price vào BOUGHT.unitPrice, bất biến khi giá niêm yết thay đổi.",
        "  • Idempotency: eventId chống mua trùng khi click đúp mạng lag."
    ], header_color=PRIMARY_BLUE)

    add_speaker_note(s5,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Trên màn hình là Lược đồ Graph Schema do nhóm thiết kế:\n"
        "- Hệ thống gồm 5 nhãn Node chính: Customer, Product, Category, GuestSession cho khách chưa đăng nhập, và SearchEvent lưu nhật ký tìm kiếm.\n"
        "- Các Node liên kết với nhau qua 7 loại quan hệ. Trong đó quan hệ BOUGHT lưu giữ đơn giá snapshot tại thời điểm mua, đảm bảo không bị ảnh hưởng nếu sau này giá sản phẩm thay đổi.\n"
        "- Về mặt tối ưu, nhóm đã tạo 8 ràng buộc duy nhất (Unique Constraints). Nhờ đó mọi truy vấn tìm kiếm Node đều thực thi trong O(1) qua toán tử NodeIndexSeek.\n"
        "- Ngoài ra hệ thống áp dụng cơ chế chặn xóa cascade: không cho phép xóa vật lý bất kỳ sản phẩm hay khách hàng nào đã phát sinh giao dịch, bảo vệ 100% tính toàn vẹn của đồ thị."
    )

    # ==========================================
    # SLIDE 6: BỘ PHÂN TÍCH Ý ĐỊNH & NGÂN SÁCH TIẾNG VIỆT
    # ==========================================
    s6 = prs.slides.add_slide(blank_layout)
    set_slide_background(s6)
    add_header(s6, "Xử Lý Ngôn Ngữ Tự Nhiên", "Bộ Phân Tích Ý Định Tìm Kiếm & Ngân Sách Tiếng Việt", "Parser v2.0-rule thuần Regex: Độ trễ < 5ms, 0 chi phí API, độ chính xác cao")

    add_card(s6, 0.8, 1.8, 5.7, 5.1, "4 Tính Năng Đột Phá Của Bộ Phân Tích", [
        "1. Token Masking (Mặt nạ bảo vệ từ khóa):",
        "    Tự động nhận diện và bảo vệ các con số nằm trong tên model và thông số kỹ thuật:",
        "    Ví dụ: 'iPhone 15', 'Galaxy S23', '16GB RAM' -> Giữ nguyên, KHÔNG bị nhận nhầm thành giá tiền 15 triệu hay 16 triệu.",
        "",
        "2. Đa dạng đơn vị tiền tệ tiếng Việt phong phú:",
        "    Hiểu linh hoạt các cách gõ tắt của người dùng:",
        "    • '15tr5', '15.5tr', '15 triệu 500' -> 15.500.000 VND",
        "    • '500k' -> 500.000 VND, '20 củ' -> 20.000.000 VND",
        "",
        "3. Xử lý phủ định thương hiệu (Brand Negation):",
        "    Nhận biết các mẫu câu 'không lấy', 'trừ', 'ngoại trừ':",
        "    Ví dụ: 'laptop không lấy dell' -> excludedBrands: ['Dell'].",
        "",
        "4. Điểm thưởng tiệm cận giá mục tiêu (Proximity Boost):",
        "    Khi tìm 'khoảng 15tr', các sản phẩm có giá càng sát 15 triệu sẽ được cộng thêm tối đa +1.5 điểm vào thứ hạng gợi ý."
    ], header_color=PRIMARY_BLUE)

    add_card(s6, 6.8, 1.8, 5.7, 5.1, "Minh Họa Kết Quả Trích Xuất JSON Thực Tế", [
        "📝 Truy vấn: 'laptop dell dưới 20 triệu'",
        "   {",
        "     category: 'RC_CAT_LAPTOP',",
        "     brands: ['Dell'],",
        "     maxPrice: 20000000, inclusiveMax: false",
        "   } -> Lọc cứng sản phẩm giá < 20 triệu",
        "",
        "📝 Truy vấn: 'tai nghe sony khoảng 1tr5'",
        "   {",
        "     category: 'RC_CAT_HEADPHONES',",
        "     brands: ['Sony'],",
        "     targetPrice: 1500000, proximityBoost: '+1.5'",
        "   } -> Ưu tiên các dòng tai nghe xấp xỉ 1.5 triệu",
        "",
        "📝 Truy vấn: 'điện thoại không lấy samsung'",
        "   {",
        "     category: 'RC_CAT_SMARTPHONE',",
        "     excludedBrands: ['Samsung']",
        "   } -> Tự động loại trừ toàn bộ điện thoại Samsung"
    ], header_color=PRIMARY_DARK)

    add_speaker_note(s6,
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Để phục vụ tìm kiếm thông minh, nhóm xây dựng module searchIntentParser v2.0 xử lý ngôn ngữ tự nhiên tiếng Việt.\n"
        "- Module này chạy thuần biểu thức chính quy (Regex) tối ưu, phản hồi trong dưới 5 mili-giây mà không tốn chi phí gọi API LLM bên ngoài.\n"
        "- Đặc biệt, nhóm phát triển thuật toán Token Masking độc quyền: khi khách gõ 'laptop dell i5 16gb ram dưới 20 triệu', hệ thống sẽ che mặt nạ chữ 'i5' và '16gb' để không bị hiểu nhầm thành 5 triệu hay 16 triệu, bóc tách chính xác ngân sách trần là 20 triệu.\n"
        "- Kết quả JSON trích xuất này được bơm trực tiếp làm tham số lọc cho động cơ gợi ý Neo4j."
    )

    # ==========================================
    # SLIDE 7: ĐỘNG CƠ GỢI Ý LAI 7 GIAI ĐOẠN
    # ==========================================
    s7 = prs.slides.add_slide(blank_layout)
    set_slide_background(s7)
    add_header(s7, "Kiến Trúc Động Cơ", "Động Cơ Gợi Ý Lai 7 Giai Đoạn (Hybrid Engine Pipeline)", "Quy trình khép kín kết hợp đa nguồn ứng viên, bộ lọc biên và cá nhân hóa")

    phases = [
        ("GĐ 1: Ngữ Cảnh", "Thu thập toàn bộ lịch sử BOUGHT, VIEWED, SEARCHED, tập sản phẩm đã ẩn (Dismissed) của người dùng."),
        ("GĐ 2: Sinh Ứng Viên", "Kích hoạt đồng thời 6 nguồn: User-CF, Đa hành vi (Multi-behavior), Tìm kiếm, Mua cùng, Mua chéo và Fallback."),
        ("GĐ 3: Lọc Điều Kiện Biên", "Loại tuyệt đối sản phẩm đã mua (WHERE NOT BOUGHT), sản phẩm đang bị ẩn và sản phẩm vượt ngân sách."),
        ("GĐ 4: Tổng Hợp Điểm", "CombinedScore = Σ(w_i × Score_i) + Điểm thưởng tiệm cận targetPrice (tối đa +1.5)."),
        ("GĐ 5: Khấu Hao & Phạt Lặp", "Áp dụng hàm mũ bán rã 2^(-Δt/λ) theo thời gian; trừ -0.25 điểm nếu sản phẩm đã xem gần đây chống nhàm chán."),
        ("GĐ 6: Xoay Vòng PRNG", "Cố định 35% vị trí hàng đầu chất lượng nhất; xáo trộn 65% vị trí còn lại bằng thuật toán Mulberry32 có Seed."),
        ("GĐ 7: Khám Phá & Chéo", "Chèn 2 sản phẩm Serendipity đột phá vào vị trí slot 3 và 7; trích xuất thanh phụ kiện Cross-category.")
    ]

    for idx, (p_title, p_desc) in enumerate(phases):
        top = 1.8 + idx * 0.74
        add_card(s7, 0.8, top, 11.7, 0.68, p_title + ":  " + p_desc, None, header_color=PRIMARY_GREEN if idx in [1, 3, 6] else TEXT_MAIN)

    add_speaker_note(s7,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy, điểm nhấn kỹ thuật quan trọng nhất của đồ án chính là Động cơ gợi ý lai 7 giai đoạn (HybridEngine.js).\n"
        "- Thay vì chỉ dùng 1 thuật toán đơn lẻ, luồng xử lý trải qua 7 bước chặt chẽ:\n"
        "  + Bắt đầu từ việc thu thập ngữ cảnh người dùng.\n"
        "  + Sinh ứng viên từ 6 nguồn đồ thị song song.\n"
        "  + Sau đó lọc bỏ triệt để hàng đã mua để tránh gợi ý vô ích.\n"
        "  + Điểm số được tổng hợp theo trọng số và suy giảm theo hàm mũ bán rã theo thời gian.\n"
        "  + Cuối cùng, hệ thống dùng thuật toán ngẫu nhiên có mầm (PRNG) và kỹ thuật Serendipity để đảm bảo mỗi lần người dùng tải lại trang đều thấy danh sách vừa thân quen vừa mới lạ, không bị mỏi mắt."
    )

    # ==========================================
    # SLIDE 8: THUẬT TOÁN 1: USER-BASED CF
    # ==========================================
    s8 = prs.slides.add_slide(blank_layout)
    set_slide_background(s8)
    add_header(s8, "Thuật Toán Đồ Thị 1", "Lọc Cộng Tác Người Dùng (User-Based Collaborative Filtering)", "Nguyên lý: Tìm kiếm những người có hành vi mua tương đồng và gợi ý sản phẩm họ chọn")

    add_card(s8, 0.8, 1.8, 5.2, 5.1, "Nguyên Lý & Công Thức Tính Điểm", [
        "📌 Triết lý cốt lõi:",
        "  'Khách hàng có cùng sở thích trong quá khứ sẽ có xu hướng lựa chọn giống nhau trong tương lai.'",
        "",
        "📐 Công thức toán học:",
        "  1. Số sản phẩm mua chung giữa 2 khách hàng c1 và c2:",
        "     sharedCount(c1, c2) = |P(c1) ∩ P(c2)|",
        "",
        "  2. Điểm gợi ý cho sản phẩm p2:",
        "     Score(p2) = Σ [c2 ∈ Peers] sharedCount(c1, c2)",
        "",
        "  3. Độ tin cậy (Support):",
        "     Support(p2) = Số người mua chung cùng chọn p2",
        "",
        "✨ Ưu điểm trên Neo4j: Chỉ duyệt 2 bước nhảy (2-hop) từ c1 qua p1 tới c2 rồi p2; không cần tính trước ma trận tương đồng offline cồng kềnh."
    ], header_color=PRIMARY_BLUE)

    cypher_code = [
        "// Truy vấn User-CF chuẩn hóa trên Neo4j",
        "MATCH (c1:Customer {customerId: $customerId})-[:BOUGHT]->(p1:Product)",
        "      <-[:BOUGHT]-(c2:Customer)",
        "WHERE c2 <> c1 AND c2.role = 'customer'",
        "WITH c1, c2, count(DISTINCT p1) AS sharedCount",
        "",
        "MATCH (c2)-[:BOUGHT]->(p2:Product)",
        "WHERE p2.active = true",
        "  AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }",
        "WITH p2, sum(sharedCount) AS score, count(DISTINCT c2) AS support",
        "RETURN p2.productId, p2.name, p2.price, score, support",
        "ORDER BY score DESC, support DESC LIMIT $limit;"
    ]

    add_card(s8, 6.3, 1.8, 6.2, 5.1, "Câu Lệnh Cypher Cốt Lõi (Parameterized)", cypher_code, header_color=PRIMARY_DARK, bg=CARD_BG)

    add_speaker_note(s8,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thuật toán đầu tiên là Lọc cộng tác trên người dùng (User-Based CF).\n"
        "- Ý tưởng là: Khi khách hàng c1 đã mua sản phẩm p1, ta đi tìm những khách hàng c2 cũng mua p1. Số sản phẩm mua chung giữa c1 và c2 chính là độ tương đồng sharedCount.\n"
        "- Tiếp theo, ta duyệt xem c2 đã mua những sản phẩm p2 nào khác. Điểm số của p2 bằng tổng độ tương đồng của những người mua chung nó.\n"
        "- Thầy cô có thể thấy trên câu lệnh Cypher: mệnh đề 'WHERE NOT EXISTS (c1)-[:BOUGHT]->(p2)' loại bỏ ngay lập tức những sản phẩm c1 đã mua rồi, giúp câu truy vấn vừa sạch dữ liệu vừa tối ưu hiệu năng."
    )

    # ==========================================
    # SLIDE 9: THUẬT TOÁN 2: ĐA HÀNH VI CÓ TRỌNG SỐ
    # ==========================================
    s9 = prs.slides.add_slide(blank_layout)
    set_slide_background(s9)
    add_header(s9, "Thuật Toán Đồ Thị 2", "Gợi Ý Đa Hành Vi Có Trọng Số (Multi-Behavior Reco)", "Khắc phục bài toán thưa thớt dữ liệu (Data Sparsity) bằng cách kết hợp cả Mua và Xem")

    add_stat_card(s9, 0.8, 1.8, 5.7, 1.8, "Trọng Số: Mua ×3.0  |  Xem ×1.0", "Công thức cân bằng hành vi", "Cam kết tài chính (Mua) có giá trị gấp 3 lần hành vi quan tâm (Xem)", PRIMARY_AMBER)

    add_card(s9, 0.8, 3.8, 5.7, 3.1, "Tại Sao Phải Cần Đa Hành Vi?", [
        "• Vấn đề thực tế: Trong thương mại điện tử, số lượt Mua chỉ chiếm 2-3%, trong khi số lượt Xem chiếm tới 97-98%. Nếu chỉ dựa vào Mua, ma trận sẽ bị 'thưa thớt' (Cold-start).",
        "• Giải pháp của nhóm: Đưa cạnh [:VIEWED] vào đồ thị tính tương đồng, nhưng gán trọng số w_viewed = 1.0 và w_bought = 3.0.",
        "• Kết quả: Ngay cả khi khách hàng mới chỉ mua 1 món nhưng đã xem vài món, hệ thống đã có thể gợi ý chuẩn xác mà không cần đợi mua nhiều."
    ], header_color=PRIMARY_DARK)

    cypher_multi = [
        "// Truy vấn Đa hành vi có trọng số",
        "MATCH (c1:Customer {customerId: $id})-[r1]->(p1)<-[r2]-(c2:Customer)",
        "WHERE type(r1) IN ['BOUGHT','VIEWED'] AND type(r2) IN ['BOUGHT','VIEWED']",
        "  AND c2 <> c1",
        "WITH c1, c2, sum(",
        "  (CASE type(r1) WHEN 'BOUGHT' THEN 3.0 ELSE 1.0 END) *",
        "  (CASE type(r2) WHEN 'BOUGHT' THEN 3.0 ELSE 1.0 END)",
        ") AS pairScore",
        "MATCH (c2)-[r]->(p2:Product)",
        "WHERE p2.active = true AND NOT EXISTS { MATCH (c1)-[:BOUGHT]->(p2) }",
        "WITH p2, sum(pairScore * (CASE type(r) WHEN 'BOUGHT' THEN 3.0 ELSE 1.0 END)) AS score",
        "RETURN p2.productId, p2.name, p2.price, score",
        "ORDER BY score DESC LIMIT $limit;"
    ]

    add_card(s9, 6.8, 1.8, 5.7, 5.1, "Mã Cypher Đa Hành Vi Kết Hợp", cypher_multi, header_color=PRIMARY_AMBER)

    add_speaker_note(s9,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy, một nhược điểm chí mạng của thuật toán CF truyền thống là hiện tượng thưa thớt dữ liệu: khách hàng xem rất nhiều nhưng mua rất ít.\n"
        "- Để giải quyết, nhóm em xây dựng thuật toán Đa hành vi (Multi-Behavior Recommendation).\n"
        "- Trên đồ thị, nhóm xét cả 2 loại quan hệ: BOUGHT và VIEWED. Hành vi mua thể hiện cam kết tài chính cao nên được gán trọng số 3.0, còn hành vi xem thể hiện sự chú ý nên gán trọng số 1.0.\n"
        "- Độ tương đồng giữa 2 khách hàng bây giờ là tích chéo giữa trọng số các hành vi tương ứng. Nhờ vậy, ngay cả với khách hàng mới, hệ thống vẫn nắm bắt được 'gu' sở thích của họ thông qua các sản phẩm họ vừa xem."
    )

    # ==========================================
    # SLIDE 10: THUẬT TOÁN 3: SERENDIPITY & MUA CHÉO
    # ==========================================
    s10 = prs.slides.add_slide(blank_layout)
    set_slide_background(s10)
    add_header(s10, "Thuật Toán Đồ Thị 3", "Mua Kèm Chéo Ngành & Khám Phá Bất Ngờ (Serendipity)", "Phá vỡ 'bong bóng lọc' (Filter Bubble) và kích thích gia tăng giá trị đơn hàng (AOV)")

    add_card(s10, 0.8, 1.8, 5.7, 5.1, "Phá Vỡ Bong Bóng Lọc (Filter Bubble)", [
        "❌ Vấn đề 'Bong bóng lọc':",
        "  Nếu khách vừa mua Laptop, thuật toán truyền thống sẽ tiếp tục gợi ý thêm 10 chiếc Laptop khác. Điều này gây khó chịu và không thực tế.",
        "",
        "💡 Giải pháp 1: Gợi ý chéo danh mục (Cross-Category)",
        "  • Thiết bị chính (Anchor): Laptop, Smartphone.",
        "  • Phụ kiện mua kèm (Add-on): Chuột không dây, Bàn phím cơ, Balo chống sốc, Củ sạc nhanh.",
        "  • Thuật toán tự động tìm các sản phẩm thuộc danh mục phụ kiện được mua chung nhiều nhất với thiết bị chính.",
        "",
        "💡 Giải pháp 2: Khám phá bất ngờ (Serendipity)",
        "  • Đề xuất các sản phẩm mới lạ, khác biệt với lịch sử nhưng vẫn có điểm đánh giá cao (Serendipity Score ≥ 0.65).",
        "  • Chèn thông minh vào vị trí Slot 3 và Slot 7 trong danh sách.",
        "  • Tỷ lệ vàng: ~70% đúng gu quen thuộc + ~30% mới lạ kích thích tò mò."
    ], header_color=PRIMARY_GREEN)

    # Image if exists
    img_path = os.path.join(IMG_DIR, "slide_14_img_15_2.png")
    if os.path.exists(img_path):
        card_img = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.8), Inches(5.7), Inches(5.1))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = BORDER_COLOR
        # Add picture
        s10.shapes.add_picture(img_path, Inches(7.0), Inches(2.2), width=Inches(5.3))
        tb_cap = s10.shapes.add_textbox(Inches(7.0), Inches(6.3), Inches(5.3), Inches(0.5))
        p = tb_cap.text_frame.paragraphs[0]
        p.text = "Hình: Mạng lưới liên kết khám phá đồ thị & Gợi ý chéo danh mục"
        p.font.name = "Segoe UI"
        p.font.size = Pt(11)
        p.font.italic = True
        p.font.color.rgb = TEXT_MUTED
        p.alignment = PP_ALIGN.CENTER
    else:
        add_card(s10, 6.8, 1.8, 5.7, 5.1, "Triết Lý Đề Xuất", [
            "Triết lý: 'Bán cần câu -> Gợi ý bán thêm mồi và thuyền'",
            "Tăng tỷ lệ chuyển đổi và doanh thu chéo (Cross-selling) cho sàn E-commerce."
        ])

    add_speaker_note(s10,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy, một điểm yếu rất lớn của các hệ thống gợi ý hiện nay là hiện tượng 'Bong bóng lọc' (Filter Bubble): khi em vừa mua một chiếc Laptop Dell, trang web lại tiếp tục gợi ý cho em 10 chiếc Laptop khác, trong khi không ai vừa mua laptop xong lại mua thêm chiếc nữa ngay lập tức.\n"
        "- Nhóm em đã giải quyết bài toán này bằng hai cơ chế:\n"
        "  1. Gợi ý chéo danh mục (Cross-Category): Khi khách mua thiết bị trung tâm là Laptop, đồ thị sẽ tự động kết nối sang các phụ kiện thiết yếu như Chuột không dây, Balo và Tai nghe.\n"
        "  2. Khám phá bất ngờ (Serendipity): Nhóm cài đặt thuật toán chọn lọc các sản phẩm có độ mới lạ cao và chèn vào vị trí số 3 và số 7 trong bảng tin.\n"
        "- Công thức này tạo ra tỷ lệ vàng: 70% sản phẩm đúng nhu cầu thiết yếu và 30% sản phẩm bất ngờ kích thích nhu cầu mua sắm chéo."
    )

    # ==========================================
    # SLIDE 11: KIẾN TRÚC HỆ THỐNG & AN TOÀN DỮ LIỆU
    # ==========================================
    s11 = prs.slides.add_slide(blank_layout)
    set_slide_background(s11)
    add_header(s11, "Kiến Trúc Kỹ Thuật", "Kiến Trúc Phân Tầng 3 Lớp & An Toàn Giao Dịch", "Tách bạch giao diện, dịch vụ xử lý và cơ sở dữ liệu đồ thị chuẩn doanh nghiệp")

    img_path = os.path.join(IMG_DIR, "slide_15_img_3_3.png")
    if os.path.exists(img_path):
        card_img = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(6.0), Inches(5.1))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = BORDER_COLOR
        s11.shapes.add_picture(img_path, Inches(1.0), Inches(2.1), width=Inches(5.6))
        tb_cap = s11.shapes.add_textbox(Inches(1.0), Inches(6.3), Inches(5.6), Inches(0.5))
        p = tb_cap.text_frame.paragraphs[0]
        p.text = "Sơ đồ kiến trúc 3 tầng: React SPA ⟷ Node.js Express API ⟷ Neo4j DBMS"
        p.font.name = "Segoe UI"
        p.font.size = Pt(11)
        p.font.italic = True
        p.font.color.rgb = TEXT_MUTED
        p.alignment = PP_ALIGN.CENTER
    else:
        add_card(s11, 0.8, 1.8, 6.0, 5.1, "Kiến Trúc 3 Tầng Hiện Đại", [
            "• Client Layer: React 18, Vite, responsive UI, CSS Variables.",
            "• Application Layer: Node.js Express, Session Auth, Cypher Query Engine.",
            "• Database Layer: Neo4j Graph DBMS, Bolt Protocol, Cypher 5."
        ])

    add_card(s11, 7.1, 1.8, 5.4, 5.1, "5 Tiêu Chuẩn Bảo Mật & Toàn Vẹn", [
        "1. Mật khẩu chuẩn mật mã scrypt-kdf:",
        "    Băm an toàn với hàm dẫn xuất khóa hiện đại, chống dò vét từ điển và brute-force.",
        "",
        "2. Phiên làm việc HttpOnly Cookie:",
        "    Cookie dt13.sid với cờ HttpOnly (chống XSS) và SameSite=Lax (chống CSRF).",
        "",
        "3. Chống Cypher Injection 100%:",
        "    Tất cả truy vấn sử dụng Parameterized Query tuyệt đối, không nối chuỗi thô.",
        "",
        "4. Giao dịch lũy thừa (Idempotency):",
        "    Gắn eventId duy nhất cho mỗi lượt mua; click đúp hoặc lag mạng vẫn chỉ trừ tiền/tạo 1 cạnh duy nhất.",
        "",
        "5. Chống tấn công tràn bộ nhớ (DoS):",
        "    Giới hạn JSON payload 100kb, vô hiệu hóa header nhận dạng X-Powered-By."
    ], header_color=PRIMARY_DARK)

    add_speaker_note(s11,
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Về mặt kỹ thuật, hệ thống được xây dựng theo kiến trúc 3 tầng chuẩn công nghiệp:\n"
        "  + Tầng giao diện là Single Page Application viết bằng React 18 và Vite, thời gian tải trang dưới 1 giây.\n"
        "  + Tầng dịch vụ là Node.js Express đóng vai trò API Gateway, xử lý phiên đăng nhập và định tuyến.\n"
        "  + Tầng CSDL là Neo4j kết nối qua giao thức Bolt nhị phân tốc độ cao.\n"
        "- Về an toàn bảo mật, toàn bộ mật khẩu được băm bằng scrypt, 100% câu lệnh Cypher được tham số hóa ngăn chặn tuyệt đối lỗi Cypher Injection, và hệ thống có cơ chế Idempotency chống mua trùng lặp khi người dùng lỡ bấm chuột 2 lần."
    )

    # ==========================================
    # SLIDE 12: GIAO DIỆN NGƯỜI DÙNG & 5 BỘ LỌC
    # ==========================================
    s12 = prs.slides.add_slide(blank_layout)
    set_slide_background(s12)
    add_header(s12, "Giao Diện Người Dùng", "Bảng Tin Gợi Ý Thông Minh & Minh Bạch Hóa Thuật Toán", "Tích hợp 5 bộ lọc thuật toán độc lập và thẻ thuyết minh công thức toán học trực quan")

    if os.path.exists(USER_IMG):
        card_img = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(7.5), Inches(5.1))
        card_img.fill.solid()
        card_img.fill.fore_color.rgb = CARD_BG
        card_img.line.color.rgb = BORDER_COLOR
        s12.shapes.add_picture(USER_IMG, Inches(0.9), Inches(2.0), width=Inches(7.3))
    else:
        add_card(s12, 0.8, 1.8, 7.5, 5.1, "Ảnh Giao Diện Cửa Hàng Người Dùng", ["Giao diện hiển thị thanh 5 nút lọc gợi ý và danh sách sản phẩm."])

    add_card(s12, 8.6, 1.8, 3.9, 5.1, "4 Tính Năng Nổi Bật Trên UI", [
        "1. Thanh 5 Bộ Lọc Thuật Toán:",
        "   Cho phép thầy cô kiểm chứng từng thuật toán riêng biệt:",
        "   • Hybrid 7 tầng (Tổng hợp)",
        "   • User-based CF",
        "   • Đa hành vi (Trọng số)",
        "   • Chéo Serendipity",
        "   • Thịnh hành Trending",
        "",
        "2. Thẻ Công Thức Trực Quan:",
        "   Hiển thị công thức toán học và giải thích tiêu chí xếp hạng tương ứng.",
        "",
        "3. Huy Hiệu Minh Bạch Lý Do:",
        "   Mỗi sản phẩm đều gắn tag rõ ràng ('Hybrid 3.4', 'Đa hành vi', 'Serendipity') giải thích vì sao được gợi ý.",
        "",
        "4. Phản Hồi Ẩn & Hoàn Tác:",
        "   Nút Dismiss ẩn sản phẩm không thích và Undo phục hồi ngay lập tức."
    ], header_color=PRIMARY_BLUE)

    add_speaker_note(s12,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Trên màn hình là giao diện Cửa hàng thực tế do nhóm em xây dựng.\n"
        "- Điểm đặc biệt nhất để phục vụ hội đồng chấm đồ án là thanh 5 nút lọc thuật toán độc lập:\n"
        "  + Thầy cô có thể bấm vào 'User-based CF' để xem kết quả lọc cộng tác thuần túy.\n"
        "  + Bấm 'Đa hành vi' để xem kết quả khi có tính thêm lượt xem.\n"
        "  + Bấm 'Chéo Serendipity' để thấy các phụ kiện mua kèm xuất hiện.\n"
        "  + Hoặc bấm 'Hybrid 7 tầng' để thấy kết quả tổng hợp tối ưu nhất.\n"
        "- Phía trên danh sách là khung thuyết minh công thức toán học và tiêu chí xếp hạng của thuật toán đang chọn.\n"
        "- Đồng thời, trên từng thẻ sản phẩm đều có huy hiệu gắn nhãn điểm số minh bạch, cùng nút Ẩn và Hoàn tác theo thời gian thực."
    )

        # ==========================================
    # SLIDE 13: GIAO DIỆN QUẢN TRỊ & MẠNG LƯỚI ĐỒ THỊ
    # ==========================================
    s13 = prs.slides.add_slide(blank_layout)
    set_slide_background(s13)
    add_header(s13, "Giao Diện Quản Trị", "Admin Console: Đồ Thị Trực Quan Hóa Đường Đi Gợi Ý", "Minh bạch hóa logic suy luận 2 bước nhảy (2-hop) qua thư viện D3/SVG")

    # Left: Real Screenshot of Graph
    card_img13 = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(7.3), Inches(3.35))
    card_img13.fill.solid()
    card_img13.fill.fore_color.rgb = CARD_BG
    card_img13.line.color.rgb = BORDER_COLOR
    if os.path.exists("C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812918646_81b96a6e.png"):
        s13.shapes.add_picture("C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812918646_81b96a6e.png", Inches(0.85), Inches(1.85), width=Inches(7.2))

    # Legend / Key below image
    add_card(s13, 0.8, 5.3, 7.3, 1.6, "Ý Nghĩa Các Nút & Vòng Tròn Trên Đồ Thị", [
        "• 🔵 Nút trung tâm: Khách hàng đang xét (Target Customer - Màu xanh dương)",
        "• 🔷 Vòng trong: Khách tương đồng (Peer Customers - Cùng sở thích)",
        "• 🟣 Cầu nối: Sản phẩm mua chung (Shared: RC_P070, RC_P009, RC_P020)",
        "• 🟢 Vòng ngoài cùng: Sản phẩm gợi ý (Recommended: Dell Vostro, HP Victus...)"
    ], header_color=PRIMARY_DARK)

    # Right: Explainable AI Card
    add_card(s13, 8.4, 1.8, 4.1, 5.1, "Explainable AI (Gợi Ý Giải Thích Được)", [
        "🎯 Giá Trị 'Gợi Ý Minh Bạch':",
        "  Khác với các mô hình Deep Learning 'hộp đen' (Black-box) không rõ lý do, Neo4j thể hiện tường minh 100% đường đi logic.",
        "",
        "🔍 Cơ Chế Duyệt 2 Bước Nhảy:",
        "  Target (C001) -> BOUGHT -> Shared (P070) <- BOUGHT <- Peer (C015) -> BOUGHT -> Recommended (Dell, HP).",
        "",
        "🛡️ Tin Cậy Cho Doanh Nghiệp:",
        "  Admin và khách hàng biết rõ nguyên nhân vì sao sản phẩm được đề xuất, tăng tỷ lệ nhấp chuột (CTR)."
    ], header_color=PRIMARY_GREEN)

    add_speaker_note(s13,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, trên màn hình là ảnh chụp thực tế tính năng 'Phân tích gợi ý' trên trang Admin của nhóm.\n"
        "- Nhóm sử dụng thư viện D3/SVG để trực quan hóa toàn bộ đường đi gợi ý:\n"
        "  + Ở giữa là khách hàng mục tiêu màu xanh dương.\n"
        "  + Các vòng tròn tím ở giữa là các sản phẩm mua chung đóng vai trò cầu nối, ví dụ như mã P070, P009, P020.\n"
        "  + Và vòng ngoài cùng màu xanh lá là các sản phẩm được thuật toán đề xuất như Laptop Dell Vostro hay HP Victus.\n"
        "- Đây chính là tính năng Explainable AI: Gợi ý có thể giải thích minh bạch. Người quản trị hoàn toàn kiểm soát được vì sao hệ thống đưa ra quyết định gợi ý đó."
    )

    # ==========================================
    # SLIDE 14: ĐÁNH GIÁ CHẤT LƯỢNG MÔ HÌNH
    # ==========================================
    s14 = prs.slides.add_slide(blank_layout)
    set_slide_background(s14)
    add_header(s14, "Đánh Giá Mô Hình", "Kết Quả Thực Nghiệm Ngoại Tuyến (Offline Evaluation)", "Kiểm thử Leave-One-Out trên 30 khách hàng và 150 sản phẩm thực tế")

    # Left: Real Screenshot of Benchmark Table
    card_img14 = s14.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.8), Inches(7.3), Inches(3.35))
    card_img14.fill.solid()
    card_img14.fill.fore_color.rgb = CARD_BG
    card_img14.line.color.rgb = BORDER_COLOR
    if os.path.exists("C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812964244_ea44764d.jpg"):
        s14.shapes.add_picture("C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812964244_ea44764d.jpg", Inches(0.85), Inches(1.85), width=Inches(7.2))

    # 4 Quick Stat Pills below image
    add_stat_card(s14, 0.8, 5.3, 1.75, 1.6, "63.3%", "Recall@10", "Cao nhất (+111%)", PRIMARY_GREEN)
    add_stat_card(s14, 2.65, 5.3, 1.75, 1.6, "0.506", "NDCG@10", "Xếp món đúng Top 1-3", PRIMARY_BLUE)
    add_stat_card(s14, 4.5, 5.3, 1.75, 1.6, "58%", "Coverage", "Bao phủ 87/150 SP", PRIMARY_AMBER)
    add_stat_card(s14, 6.35, 5.3, 1.75, 1.6, "41.1 ms", "Độ trễ Median", "Chuẩn Real-time", PRIMARY_DARK)

    # Right: Analysis Card
    add_card(s14, 8.4, 1.8, 4.1, 5.1, "Phân Tích Kết Quả Thực Nghiệm", [
        "📊 So Sánh 3 Phương Pháp:",
        "1. Phổ Biến (Popularity):",
        "  Recall chỉ 30%, Coverage chỉ 8.3% (bị điểm mù hàng hot, bỏ quên 110 sản phẩm trong kho).",
        "",
        "2. Lọc Cộng Tác Đồ Thị (Graph CF):",
        "  Recall 60% (+112%), NDCG 0.482, Coverage 56% (khai thác 83 sản phẩm).",
        "",
        "3. Hệ Gợi Ý Lai (Hybrid Feed):",
        "  • Recall đạt đỉnh 63.3% (đoán trúng 6.3/10 khách).",
        "  • NDCG đạt 0.506 (đẩy sản phẩm đúng lên ngay Top 1 - 3).",
        "  • Coverage 58% (giúp hàng đuôi dài Long-tail tiếp cận người mua).",
        "  • Tốc độ phản hồi cực nhanh: 41.1 ms."
    ], header_color=PRIMARY_DARK)

    add_speaker_note(s14,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, đây là bảng số liệu đo lường thực nghiệm thực tế chạy trực tiếp trên hệ thống của nhóm qua phương pháp Leave-One-Out trên 30 khách hàng:\n"
        "- Nhóm đã so sánh đối đầu giữa 3 phương pháp:\n"
        "  1. Thuật toán Phổ biến (Popularity) có độ phủ rất tệ chỉ 8.3%, tức là 110 sản phẩm khác trong kho hoàn toàn bị lãng quên.\n"
        "  2. Khi áp dụng Lọc cộng tác đồ thị (Graph CF), độ chính xác Recall tăng vọt lên 60% (tăng hơn 112%) và độ phủ đạt 56%.\n"
        "  3. Đặc biệt, Mô hình lai Hybrid Feed đạt kết quả cao nhất: Recall 63.3%, chỉ số xếp hạng NDCG đạt 0.506 đưa sản phẩm mong muốn lên ngay vị trí Top 1 đến Top 3, độ phủ đạt 58% và thời gian phản hồi trung vị chỉ mất 41.1 mili-giây.\n"
        "- Kết quả thực nghiệm này khẳng định tính ưu việt vượt trội của giải pháp đồ thị lai do nhóm đề xuất."
    )

# ==========================================
    # SLIDE 15: ĐO LƯỜNG HIỆU NĂNG THỰC TẾ
    # ==========================================
    s15 = prs.slides.add_slide(blank_layout)
    set_slide_background(s15)
    add_header(s15, "Tối Ưu Hiệu Năng", "Kết Quả Đo Lường EXPLAIN & PROFILE Trên Neo4j", "Toán tử NodeIndexSeek O(1), toàn bộ hành trình duyệt đồ thị 2 bước nhảy chỉ tốn 386 DbHits")

    add_stat_card(s15, 0.8, 1.8, 3.6, 1.8, "386", "DbHits toàn hành trình", "Duyệt 2 bước nhảy (2-hop traversal)", PRIMARY_GREEN)
    add_stat_card(s15, 4.8, 1.8, 3.6, 1.8, "< 15 ms", "Thời gian thực thi", "Sau warm-up bộ nhớ đệm (Cache)", PRIMARY_BLUE)
    add_stat_card(s15, 8.8, 1.8, 3.7, 1.8, "328 B", "Bộ nhớ cấp phát", "Tối ưu RAM tuyệt đối", PRIMARY_DARK)

    add_card(s15, 0.8, 3.9, 5.7, 3.0, "Phân Tích Toán Tử Gốc (Root Operator)", [
        "• Toán tử gốc: NodeIndexSeek",
        "  Nhờ ràng buộc duy nhất Customer(customerId), Neo4j truy cập trực tiếp đến địa chỉ vật lý của nút c1 trong O(1) mà không cần quét toàn bộ bảng (Full Scan).",
        "• Toán tử duyệt: Expand(All)",
        "  Từ c1 men theo các con trỏ vật lý tới các sản phẩm p1 và khách hàng c2.",
        "• Toán tử lọc: AntiSemiHashJoin (Not Exists)",
        "  Loại trừ tức thời các sản phẩm c1 đã mua với chi phí tính toán tối thiểu."
    ], header_color=PRIMARY_DARK)

    add_card(s15, 6.8, 3.9, 5.7, 3.0, "Đối Chiếu Chuẩn Hệ Thống Real-Time", [
        "• Ngưỡng công nghiệp E-commerce: Thời gian phản hồi API gợi ý phải dưới 200 ms.",
        "• Kết quả đo lường thực tế của đồ án: < 15 ms (vượt tiêu chuẩn hơn 10 lần).",
        "• Khả năng chịu tải: Với chi phí chỉ 386 DbHits cho mỗi lượt truy vấn, hệ thống có thể phục vụ hàng trăm yêu cầu gợi ý đồng thời mà không gây nghẽn CPU/RAM.",
        "• Chứng minh tính ưu việt vượt trội của Neo4j so với việc thực hiện 4 phép JOIN trong CSDL quan hệ."
    ], header_color=PRIMARY_GREEN)

    add_speaker_note(s15,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy, để chứng minh câu lệnh Cypher được tối ưu triệt để, nhóm đã chạy công cụ PROFILE và EXPLAIN trực tiếp trên Neo4j Browser:\n"
        "- Kết quả cho thấy: Toán tử gốc là NodeIndexSeek truy xuất nút khách hàng gốc trong O(1) nhờ index duy nhất.\n"
        "- Toàn bộ hành trình duyệt đồ thị 2 bước nhảy qua hàng trăm mối quan hệ chỉ tiêu tốn đúng 386 DbHits và cấp phát 328 Bytes bộ nhớ.\n"
        "- Thời gian thực thi sau khi warm-up bộ nhớ đệm chỉ dưới 15 mili-giây, nhanh hơn gấp 10 lần so với chuẩn 200 mili-giây của các sàn E-commerce lớn. Điều này chứng minh hiệu năng xuất sắc của giải pháp đồ thị."
    )

    # ==========================================
    # SLIDE 16: TỔNG KẾT KẾT QUẢ ĐẠT ĐƯỢC
    # ==========================================
    s16 = prs.slides.add_slide(blank_layout)
    set_slide_background(s16)
    add_header(s16, "Tổng Kết Đồ Án", "Kết Quả Đạt Được: Đối Chiếu Barem Điểm 10/10", "Hoàn thành toàn diện mọi tiêu chí từ CSDL đồ thị, thuật toán, hiệu năng đến giao diện")

    eval_items = [
        ("2.0đ", "Mô Hình Đồ Thị Hoàn Thiện", "Chuẩn hóa 5 nhãn Node, 7 loại Edge, 8 Unique Constraints và quy tắc chống cascade delete.", PRIMARY_BLUE),
        ("2.0đ", "Quy Mô Dữ Liệu Lớn Thực Tế", "150 Sản phẩm công nghệ từ CellphoneS, 65 Khách hàng, >900 quan hệ BOUGHT/VIEWED đan xen.", PRIMARY_GREEN),
        ("2.5đ", "Hệ Thống Thuật Toán Đa Dạng", "Cài đặt hoàn chỉnh User-CF, Đa hành vi (w=3:1), Serendipity, Cross-category & Động cơ lai 7 tầng.", PRIMARY_AMBER),
        ("1.5đ", "Đo Lường & Tối Ưu Hiệu Năng", "EXPLAIN/PROFILE chi tiết chỉ 386 DbHits, thời gian <15ms, kèm module Offline Evaluation tự động.", PRIMARY_DARK),
        ("2.0đ", "Giao Diện Web Ứng Dụng Đầy Đủ", "Single Page App React mượt mà, chuyển đổi 5 bộ lọc thuật toán tức thì, xem Cypher trực quan, Admin D3.", PRIMARY_GREEN)
    ]

    for idx, (pts, title, desc, color) in enumerate(eval_items):
        top = 1.8 + idx * 1.02
        card = s16.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(top), Inches(11.7), Inches(0.92))
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = BORDER_COLOR
        tf = card.text_frame
        tf.word_wrap = True
        tf.margin_left = Inches(0.25)
        tf.margin_top = Inches(0.18)

        p = tf.paragraphs[0]
        p.text = f"[{pts}]  {title}"
        p.font.name = "Segoe UI"
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = color

        p_desc = tf.add_paragraph()
        p_desc.text = desc
        p_desc.font.name = "Segoe UI"
        p_desc.font.size = Pt(11)
        p_desc.font.color.rgb = TEXT_MUTED
        p_desc.space_before = Pt(3)

    add_speaker_note(s16,
        "KỊCH BẢN THUYẾT TRÌNH (35 giây):\n"
        "- Tự đánh giá đối chiếu với barem chấm điểm của học phần, nhóm DT13 đã hoàn thành toàn diện và vượt mức yêu cầu ở tất cả các hạng mục:\n"
        "- Từ mô hình đồ thị chuẩn hóa, quy mô dữ liệu thật 150 sản phẩm,\n"
        "- Đến hệ thống giải thuật đa dạng từ User-CF, Đa hành vi đến Serendipity và Động cơ lai 7 tầng,\n"
        "- Kèm theo phân tích hiệu năng EXPLAIN/PROFILE và ứng dụng web hoàn chỉnh có thể tương tác trực tiếp.\n"
        "- Nhóm tự tin đồ án đạt chuẩn chất lượng xuất sắc 10/10."
    )

    # ==========================================
    # SLIDE 17: HƯỚNG PHÁT TRIỂN TƯƠNG LAI
    # ==========================================
    s17 = prs.slides.add_slide(blank_layout)
    set_slide_background(s17)
    add_header(s17, "Mở Rộng", "Lộ Trình Phát Triển & Mở Rộng Hệ Thống", "Định hướng nâng cấp công nghệ sẵn sàng cho môi trường thương mại điện tử quy mô lớn")

    add_card(s17, 0.8, 1.8, 5.7, 2.4, "1. Graph Neural Networks (GNN)", [
        "• Áp dụng các kiến trúc mạng nơ-ron đồ thị tiên tiến như Node2Vec, GraphSAGE.",
        "• Học vector nhúng sâu (Deep Embeddings) của người dùng và sản phẩm trên đồ thị.",
        "• Bắt trọn các mối quan hệ phi tuyến tính phức tạp hơn."
    ], header_color=PRIMARY_BLUE)

    add_card(s17, 6.8, 1.8, 5.7, 2.4, "2. Xử Lý Luồng Sự Kiện (Clickstream Streaming)", [
        "• Tích hợp Apache Kafka hoặc Redis Streams để ghi nhận hành vi xem/click chuột theo thời gian thực.",
        "• Cập nhật trọng số đồ thị tức thời mà không cần gọi API tuần tự, đáp ứng hàng triệu người dùng đồng thời."
    ], header_color=PRIMARY_GREEN)

    add_card(s17, 0.8, 4.5, 5.7, 2.4, "3. Học Tăng Cường (Reinforcement Learning)", [
        "• Ứng dụng mô hình Multi-Armed Bandit (MAB) hoặc Q-Learning.",
        "• Tự động tinh chỉnh trọng số của 6 nguồn gợi ý dựa trên phản hồi nhấp chuột (CTR) thực tế của người dùng.",
        "• Hệ thống tự học và ngày càng thông minh hơn theo thời gian."
    ], header_color=PRIMARY_AMBER)

    add_card(s17, 6.8, 4.5, 5.7, 2.4, "4. Giỏ Hàng Đa Sản Phẩm & Redis Phân Tán", [
        "• Mở rộng hỗ trợ mua sắm nhiều món cùng lúc (Multi-item Cart).",
        "• Sử dụng Redis lưu trữ Session phân tán, sẵn sàng mở rộng quy mô hệ thống theo cụm Microservices (Horizontal Scaling)."
    ], header_color=PRIMARY_DARK)

    add_speaker_note(s17,
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Về hướng phát triển tương lai, nhóm đề xuất 4 hướng nâng cấp công nghệ:\n"
        "1. Tích hợp Mạng nơ-ron đồ thị (GNN) để học biểu diễn vector sâu.\n"
        "2. Sử dụng Apache Kafka xử lý luồng sự kiện click chuột thời gian thực.\n"
        "3. Áp dụng Học tăng cường để trọng số thuật toán tự thích nghi theo hành vi người dùng.\n"
        "4. Và triển khai Redis Session phân tán để sẵn sàng chịu tải lớn trong thực tế."
    )

    # ==========================================
    # SLIDE 18: LỜI CẢM ƠN & SẴN SÀNG LIVE DEMO
    # ==========================================
    s18 = prs.slides.add_slide(blank_layout)
    set_slide_background(s18, PRIMARY_DARK)

    tb = s18.shapes.add_textbox(Inches(1.0), Inches(1.5), Inches(11.3), Inches(1.2))
    p = tb.text_frame.paragraphs[0]
    p.text = "XIN CHÂN THÀNH CẢM ƠN THẦY CÔ VÀ HỘI ĐỒNG!"
    p.font.name = "Segoe UI"
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)
    p.alignment = PP_ALIGN.CENTER

    p_sub = tb.text_frame.add_paragraph()
    p_sub.text = "Nhóm DT13 rất mong nhận được những góp ý quý báu từ Thầy Cô"
    p_sub.font.name = "Segoe UI"
    p_sub.font.size = Pt(16)
    p_sub.font.color.rgb = RGBColor(148, 163, 184)
    p_sub.alignment = PP_ALIGN.CENTER
    p_sub.space_before = Pt(8)

    # Live demo invite card
    demo_card = s18.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(2.2), Inches(3.2), Inches(8.9), Inches(2.2))
    demo_card.fill.solid()
    demo_card.fill.fore_color.rgb = RGBColor(15, 23, 42)
    demo_card.line.color.rgb = PRIMARY_GREEN
    demo_card.line.width = Pt(2.0)
    tf = demo_card.text_frame
    tf.word_wrap = True
    tf.margin_top = Inches(0.4)

    p1 = tf.paragraphs[0]
    p1.text = "🚀 KÍNH MỜI THẦY CÔ THEO DÕI PHẦN LIVE DEMO HỆ THỐNG"
    p1.font.name = "Segoe UI"
    p1.font.size = Pt(18)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(52, 211, 153)
    p1.alignment = PP_ALIGN.CENTER

    p2 = tf.add_paragraph()
    p2.text = "Trải nghiệm trực tiếp 5 bộ lọc thuật toán • Thuyết minh công thức trực quan • Phân tích mạng nhện đồ thị Admin"
    p2.font.name = "Segoe UI"
    p2.font.size = Pt(13)
    p2.font.color.rgb = RGBColor(203, 213, 225)
    p2.alignment = PP_ALIGN.CENTER
    p2.space_before = Pt(8)

    add_speaker_note(s18,
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Em xin chân thành cảm ơn TS. Trần Quang Bình đã tận tình hướng dẫn nhóm trong suốt học phần, và cảm ơn Quý Thầy Cô trong Hội đồng đã lắng nghe.\n"
        "- Sau đây, nhóm DT13 xin trân trọng kính mời Thầy Cô theo dõi phần Live Demo trực tiếp hệ thống trên trình duyệt để kiểm chứng các tính năng vừa trình bày.\n"
        "- Nhóm em đã sẵn sàng trả lời các câu hỏi phản biện từ Thầy Cô!"
    )

    output_path = "C:/Users/Thinkpad/dt13-recommendation-system/Bao_Cao_He_Thong_Goi_Y_Neo4j_DT13.pptx"
    prs.save(output_path)
    print(f"Successfully generated PowerPoint presentation at: {output_path}")
    print(f"Total slides: {len(prs.slides)}")

if __name__ == '__main__':
    build_presentation()
