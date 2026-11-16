import os
import sys
import copy
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def merge_presentations():
    src_pptx = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794807884735_5e1000d8.pptx"
    out_pptx = "C:/Users/Thinkpad/dt13-recommendation-system/Bao_Cao_He_Thong_Goi_Y_Neo4j_DT13_Hoan_Chinh.pptx"

    prs = Presentation(src_pptx)
    print(f"Loaded source presentation with {len(prs.slides)} slides.")

    GRAPH_IMG = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812918646_81b96a6e.png"
    EVAL_IMG = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794812964244_ea44764d.jpg"
    STORE_IMG = "C:/Users/Thinkpad/.gemini/antigravity/brain/4f0a3e0c-e4d9-4645-8ebe-d37663365f70/.user_uploaded/media_1794809277696_dccfce01.jpg"

    def set_notes(slide, notes_text):
        slide.notes_slide.notes_text_frame.text = notes_text

    # ==========================================
    # SLIDE 1: BÌA
    # ==========================================
    set_notes(prs.slides[0],
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Kính chào Quý Thầy Cô trong Hội đồng phản biện và các bạn sinh viên.\n"
        "- Em là Lê Hữu Luân, đại diện nhóm DT13 gồm 3 thành viên: Luân, Nguyên và Tuấn.\n"
        "- Hôm nay nhóm chúng em xin phép được báo cáo đề tài Đồ án môn học Cơ sở dữ liệu NoSQL: 'Hệ thống gợi ý sản phẩm tương quan - Hybrid Graph Recommendation System trên cơ sở dữ liệu đồ thị Neo4j', dưới sự hướng dẫn của TS. Trần Quang Bình.\n"
        "- Sau đây em xin bắt đầu phần trình bày."
    )

    # ==========================================
    # SLIDE 2: MỤC LỤC TỔNG QUAN
    # ==========================================
    set_notes(prs.slides[1],
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Báo cáo của nhóm được tổ chức thành 6 phần chặt chẽ:\n"
        "1. Bối cảnh & Điểm nghẽn RDBMS so với giải pháp Neo4j.\n"
        "2. Quản lý sản phẩm và các quy tắc nghiệp vụ toàn vẹn dữ liệu.\n"
        "3. Mô hình đồ thị Neo4j & 8 ràng buộc duy nhất O(1).\n"
        "4. Bộ phân tích ý định tìm kiếm & ngân sách tiếng Việt.\n"
        "5. Động cơ gợi ý lai 7 giai đoạn và các giải thuật đồ thị cốt lõi.\n"
        "6. Đo lường hiệu năng thực tế, đối chiếu barem và phần Live Demo."
    )

    # ==========================================
    # SLIDE 3: BỐI CẢNH & TẠI SAO CHỌN NEO4J
    # ==========================================
    set_notes(prs.slides[2],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, trong các sàn thương mại điện tử, bài toán cốt lõi là: 'Tìm những người mua sản phẩm giống bạn và gợi ý những món họ đã chọn'.\n"
        "- Nhìn vào hình bên trái, nếu giải bằng SQL truyền thống, ta phải JOIN qua 4 bảng: Customers với Orders, Orders với Order_Items, rồi mới tới Products. Khi dữ liệu lớn, chi phí quét index và nối bảng tăng theo cấp số nhân, dẫn đến nghẽn hệ thống.\n"
        "- Nhìn vào hình bên phải, Neo4j sử dụng cơ chế Index-Free Adjacency: mỗi nút giữ con trỏ bộ nhớ tới các nút kề nó. Tốc độ duyệt chỉ phụ thuộc số liên kết k: O(k), hoàn toàn độc lập với kích thước toàn bộ CSDL, đảm bảo tốc độ phản hồi mili-giây thời gian thực."
    )

    # ==========================================
    # SLIDE 4: QUẢN LÝ SẢN PHẨM: 7 EPICS & 20 BACKLOG ITEMS
    # ==========================================
    # Update EP-02 text from "120 SP, 6 danh mục" to "150 SP, 6 danh mục"
    s4 = prs.slides[3]
    for sh in s4.shapes:
        if sh.has_text_frame and "120 SP" in sh.text_frame.text:
            sh.text_frame.text = sh.text_frame.text.replace("120 SP", "150 SP")
    set_notes(s4,
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Về mặt quản lý sản phẩm, nhóm đã phân rã đồ án thành 7 Epics nghiệp vụ gồm 20 Backlog items:\n"
        "- Bao quát toàn diện từ Xác thực phiên (EP-01), Duyệt 150 sản phẩm thuộc 6 danh mục (EP-02), Tương tác đa hành vi Mua và Xem (EP-03), Lịch sử người dùng (EP-04), Động cơ gợi ý lai (EP-05) đến Bảng điều khiển quản trị Admin (EP-06).\n"
        "- Toàn bộ các yêu cầu chức năng đều có tiêu chí nghiệm thu rõ ràng."
    )

    # ==========================================
    # SLIDE 5: ĐÁNH GIÁ TRẠNG THÁI & CHUẨN ĐỘI NGŨ (DoR / DoD)
    # ==========================================
    set_notes(prs.slides[4],
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Về tiến độ triển khai, nhóm đã hoàn thành đầy đủ 19/20 items (đạt 95%) ở cả Backend API và Frontend React.\n"
        "- Hạng mục duy nhất PB-020 về giỏ hàng đa sản phẩm và Redis Session phân tán được nhóm định vị là kiến trúc mở rộng tương lai.\n"
        "- Quy trình phát triển tuân thủ nghiêm ngặt chuẩn DoR (Definition of Ready) và DoD (Definition of Done): 100% code kiểm thử Pass, 0 lỗi lint và tuân thủ chặt chẽ ràng buộc Neo4j."
    )

    # ==========================================
    # SLIDE 6: BUSINESS RULES 1/2 (BR-001..005)
    # ==========================================
    set_notes(prs.slides[5],
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Nhóm đã xây dựng 10 quy tắc nghiệp vụ bảo vệ toàn vẹn dữ liệu.\n"
        "- 5 quy tắc đầu tiên tập trung vào an toàn giao dịch:\n"
        "  + BR-002: Chống xóa cascade, không cho phép xóa vật lý bất kỳ sản phẩm hay khách hàng nào đã có lịch sử BOUGHT/VIEWED.\n"
        "  + BR-003: Idempotency replay, gắn eventId chống mua trùng lặp khi người dùng click đúp do lag mạng.\n"
        "  + BR-004: Chụp đơn giá Snapshot vào thuộc tính unitPrice trên cạnh BOUGHT.\n"
        "  + BR-005: Loại trừ tuyệt đối các sản phẩm đã mua khỏi mọi luồng gợi ý."
    )

    # ==========================================
    # SLIDE 7: BUSINESS RULES 2/2 (BR-006..010)
    # ==========================================
    set_notes(prs.slides[6],
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- 5 quy tắc tiếp theo phục vụ tìm kiếm và động cơ gợi ý:\n"
        "  + BR-006: Ràng buộc ngân sách với điểm thưởng tiệm cận targetPrice tối đa +1.5 điểm.\n"
        "  + BR-007: Token Masking bảo vệ các con số trong tên model như iPhone 15, 16GB RAM khỏi bị nhận nhầm thành giá tiền.\n"
        "  + BR-009: Cơ chế Ẩn (Dismiss) và Hoàn tác (Undo) theo thời gian thực.\n"
        "  + BR-010: Hàm mũ bán rã theo thời gian 2^(-age/halfLife) và trừ 0.25 điểm phạt lặp nếu đã xem gần đây."
    )

    # ==========================================
    # SLIDE 8: MÔ HÌNH ĐỒ THỊ NEO4J (SCHEMAS & CONSTRAINTS)
    # ==========================================
    set_notes(prs.slides[7],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Trên màn hình là Lược đồ Graph Schema do nhóm thiết kế:\n"
        "- Hệ thống gồm 5 nhãn Node chính: Customer, Product, Category, GuestSession và SearchEvent.\n"
        "- Các Node liên kết qua 7 loại quan hệ: BELONGS_TO, BOUGHT, VIEWED, SEARCHED, IMPRESSED, DISMISSED.\n"
        "- Đặc biệt, nhóm đã khởi tạo 8 ràng buộc duy nhất (Unique Constraints) tự động qua lệnh db:schema, đảm bảo mọi truy xuất tìm kiếm Node đều đạt độ phức tạp O(1) qua toán tử NodeIndexSeek."
    )

    # ==========================================
    # SLIDE 9: TÌM KIẾM NGỮ NGHĨA - BỘ PHÂN TÍCH Ý ĐỊNH
    # ==========================================
    set_notes(prs.slides[8],
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Nhóm xây dựng module searchIntentParser v2.0 xử lý ngôn ngữ tự nhiên tiếng Việt thuần bằng Regex tối ưu, phản hồi dưới 5 mili-giây mà không tốn chi phí gọi API LLM.\n"
        "- Module hiểu linh hoạt các đơn vị gõ tắt tiếng Việt: 'tr5', 'k', 'củ', nhận diện câu phủ định như 'không lấy dell', và áp dụng kỹ thuật Token Masking bảo vệ thông số máy tính, điện thoại."
    )

    # ==========================================
    # SLIDE 10: VÍ DỤ TRÍCH XUẤT Ý ĐỊNH THỰC TẾ (JSON API)
    # ==========================================
    set_notes(prs.slides[9],
        "KỊCH BẢN THUYẾT TRÌNH (35 giây):\n"
        "- Thầy Cô có thể thấy 3 ví dụ kết quả JSON trích xuất thực tế:\n"
        "1. 'laptop dell dưới 20 triệu' -> Bóc tách chính xác danh mục LAPTOP, hãng Dell, giá trần 20 triệu.\n"
        "2. 'tai nghe sony khoảng 1tr5' -> Trích xuất targetPrice 1.5 triệu và cộng điểm thưởng tiệm cận +1.5.\n"
        "3. 'điện thoại không lấy samsung' -> Tự động đưa Samsung vào mảng excludedBrands.\n"
        "- Dữ liệu JSON này được nạp trực tiếp làm tham số lọc cho câu lệnh Cypher."
    )

    # ==========================================
    # SLIDE 11: ĐỘNG CƠ GỢI Ý LAI 7 GIAI ĐOẠN
    # ==========================================
    set_notes(prs.slides[10],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Điểm sáng công nghệ cốt lõi của đồ án là Động cơ gợi ý lai 7 giai đoạn (HybridEngine.js):\n"
        "- Quy trình khép kín: GĐ1 thu thập ngữ cảnh -> GĐ2 kích hoạt song song 6 nguồn ứng viên đồ thị -> GĐ3 lọc biên loại hàng đã mua -> GĐ4 tổng hợp điểm số có trọng số -> GĐ5 khấu hao thời gian theo hàm mũ bán rã và phạt lặp -> GĐ6 xoay vòng PRNG Mulberry32 -> GĐ7 chèn sản phẩm Serendipity và phụ kiện Cross-category."
    )

    # ==========================================
    # SLIDE 12: THUẬT TOÁN 1: USER-BASED CF
    # ==========================================
    set_notes(prs.slides[11],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thuật toán đầu tiên là Lọc cộng tác trên người dùng (User-Based CF):\n"
        "- Khi khách hàng c1 đã mua sản phẩm p1, hệ thống tìm các khách hàng c2 cũng mua p1. Số sản phẩm mua chung chính là độ tương đồng sharedCount.\n"
        "- Sau đó duyệt xem c2 đã mua những sản phẩm p2 nào khác để xếp hạng.\n"
        "- Mệnh đề 'WHERE NOT EXISTS (c1)-[:BOUGHT]->(p2)' loại bỏ ngay lập tức những món c1 đã mua rồi tại tầng CSDL. Toàn bộ hành trình chỉ là 2 bước nhảy (2-hop) thực thi cực nhanh trên Neo4j."
    )

    # ==========================================
    # SLIDE 13: THUẬT TOÁN 2: ĐA HÀNH VI (MUA X3.0 + XEM X1.0)
    # ==========================================
    set_notes(prs.slides[12],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Để giải quyết bài toán Thưa thớt dữ liệu (Data Sparsity) khi khách hàng xem nhiều mà mua ít, nhóm xây dựng thuật toán Đa hành vi có trọng số:\n"
        "- Trên đồ thị, nhóm xét đồng thời cả 2 quan hệ BOUGHT và VIEWED. Hành vi Mua thể hiện cam kết tài chính cao nên được gán trọng số 3.0, còn hành vi Xem gán trọng số 1.0.\n"
        "- Độ tương đồng giữa 2 khách hàng là tích chéo giữa các hành vi. Nhờ vậy ngay cả khi khách mới chỉ xem lướt qua vài sản phẩm, hệ thống đã bắt trọn được 'gu' sở thích của họ."
    )

    # ==========================================
    # SLIDE 14: KHÁM PHÁ ĐỘT PHÁ: SERENDIPITY & MUA CHÉO
    # ==========================================
    set_notes(prs.slides[13],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Để phá vỡ 'Bong bóng lọc' (Filter Bubble) - tránh việc vừa mua laptop lại bị gợi ý thêm 10 laptop khác, nhóm áp dụng 2 kỹ thuật:\n"
        "1. Gợi ý chéo danh mục (Cross-Category): Mua thiết bị chính là Laptop tự động liên kết tới phụ kiện như Chuột, Balo, Tai nghe.\n"
        "2. Khám phá bất ngờ (Serendipity): Chèn sản phẩm mới lạ có điểm cao vào vị trí số 3 và số 7.\n"
        "- Tỷ lệ vàng: 70% sản phẩm đúng nhu cầu quen thuộc + 30% sản phẩm bất ngờ kích thích mua sắm chéo, gia tăng giá trị đơn hàng trung bình."
    )

    # ==========================================
    # SLIDE 15: KIẾN TRÚC & BẢO MẬT
    # ==========================================
    set_notes(prs.slides[14],
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Hệ thống được xây dựng theo kiến trúc 3 tầng chuẩn công nghiệp:\n"
        "  + Tầng giao diện: React 18 SPA với Vite.\n"
        "  + Tầng ứng dụng: Node.js Express API xử lý phiên và điều phối luồng gợi ý.\n"
        "  + Tầng CSDL: Neo4j kết nối qua giao thức nhị phân Bolt Protocol.\n"
        "- Bảo mật: Mật khẩu băm bằng scrypt, cookie HttpOnly chống XSS/CSRF, 100% câu truy vấn Cypher được tham số hóa chống Cypher Injection, và cơ chế Idempotency chống mua trùng lặp."
    )

    # ==========================================
    # SLIDE 16: GIAO DIỆN WEB CLIENT (UPDATE ẢNH MỚI + TEXT)
    # ==========================================
    s16 = prs.slides[15]
    for sh in s16.shapes:
        if sh.has_text_frame and "Chuyển đổi 3 thuật toán" in sh.text_frame.text:
            sh.text_frame.text = "Chuyển đổi 5 thuật toán: Hybrid 7 tầng, Chuẩn CF, Đa hành vi, Chéo Serendipity, Thịnh hành; kèm thẻ công thức toán học và huy hiệu điểm số minh bạch."
    # If image shape exists, update left picture with STORE_IMG
    for sh in s16.shapes:
        if sh.shape_type == 13 and sh.left < Inches(4.5) and os.path.exists(STORE_IMG):
            # Replace left picture
            left, top, w, h = sh.left, sh.top, sh.width, sh.height
            sp_tree = s16.shapes._spTree
            sp_tree.remove(sh._element)
            s16.shapes.add_picture(STORE_IMG, left, top, width=w)
            break
    set_notes(s16,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Trên màn hình là giao diện Cửa hàng thực tế của nhóm:\n"
        "- Điểm đặc biệt nhất giúp Thầy Cô dễ dàng kiểm chứng đồ án là Thanh lọc 5 thuật toán độc lập:\n"
        "  + Bấm 'User-based CF' để xem kết quả lọc cộng tác thuần túy.\n"
        "  + Bấm 'Đa hành vi' để thấy sự thay đổi khi tính thêm trọng số lượt xem.\n"
        "  + Bấm 'Chéo Serendipity' để thấy các phụ kiện mua kèm xuất hiện.\n"
        "  + Hoặc bấm 'Hybrid 7 tầng' để xem bảng tin tổng hợp tối ưu nhất.\n"
        "- Mỗi thuật toán đều có thẻ hiển thị công thức toán học đi kèm. Đồng thời, trên từng thẻ sản phẩm đều có huy hiệu gắn nhãn điểm số minh bạch, cùng nút Ẩn và Hoàn tác theo thời gian thực."
    )

    # ==========================================
    # SLIDE 17: BẢNG ĐIỀU KHIỂN QUẢN TRỊ (EMBED D3 GRAPH)
    # ==========================================
    s17 = prs.slides[16]
    # Update subtitle to include D3 graph
    for sh in s17.shapes:
        if sh.has_text_frame and "Admin Console & Đồ Thị" in sh.text_frame.text:
            sh.text_frame.text = "Admin Console: Đồ Thị Trực Quan Hóa Đường Đi Gợi Ý (D3/SVG)"

    # Embed real graph image on Slide 17 if available
    if os.path.exists(GRAPH_IMG):
        # Place graph image prominently across top-center
        s17.shapes.add_picture(GRAPH_IMG, Inches(0.5), Inches(1.5), width=Inches(8.1))
        # Add a neat caption text
        cap_box = s17.shapes.add_textbox(Inches(0.5), Inches(5.1), Inches(8.1), Inches(0.5))
        p = cap_box.text_frame.paragraphs[0]
        p.text = "Hình: Mạng nhện trực quan hóa D3/SVG - Cầu nối sản phẩm mua chung (tím) giữa khách mục tiêu (xanh) và sản phẩm đề xuất (xanh lá)"
        p.font.name = "Segoe UI"
        p.font.size = Pt(10)
        p.font.italic = True
        p.font.color.rgb = RGBColor(71, 85, 105)

    set_notes(s17,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, trên màn hình là giao diện Admin Console và sơ đồ mạng nhện trực quan hóa đường đi gợi ý bằng thư viện D3/SVG:\n"
        "- Ở trung tâm là Khách hàng mục tiêu màu xanh dương.\n"
        "- Các vòng tròn tím ở giữa là các sản phẩm mua chung đóng vai trò cầu nối, ví dụ như mã P070, P009, P020.\n"
        "- Các nút trung gian là Khách hàng tương đồng (Peer Customers).\n"
        "- Và vòng ngoài cùng màu xanh lá là các sản phẩm được đề xuất như Laptop Dell Vostro hay HP Victus.\n"
        "- Đây chính là tính năng Explainable AI: Gợi ý có thể giải thích minh bạch. Người quản trị hoàn toàn kiểm soát được vì sao hệ thống đưa ra quyết định gợi ý đó."
    )

    # ==========================================
    # SLIDE 18: ĐÁNH GIÁ CHẤT LƯỢNG MÔ HÌNH (EMBED BENCHMARK TABLE)
    # ==========================================
    s18 = prs.slides[17]
    # Update subtitle
    for sh in s18.shapes:
        if sh.has_text_frame and "Đánh Giá Ngoại Tuyến" in sh.text_frame.text:
            sh.text_frame.text = "Kết Quả Thực Nghiệm Ngoại Tuyến (Offline Evaluation - Leave-One-Out)"

    # Embed real evaluation image on Slide 18 if available
    if os.path.exists(EVAL_IMG):
        s18.shapes.add_picture(EVAL_IMG, Inches(0.5), Inches(1.5), width=Inches(8.1))
        # Add 4 quick pills at bottom
        pill_box = s18.shapes.add_textbox(Inches(0.5), Inches(5.1), Inches(8.1), Inches(0.5))
        p = pill_box.text_frame.paragraphs[0]
        p.text = "🎯 Recall@10: 63.3% (+111%)  |  ⭐ NDCG@10: 0.506 (Top 1-3)  |  📦 Coverage: 58% (87/150 SP)  |  ⚡ Độ trễ: 41.1 ms"
        p.font.name = "Segoe UI"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = RGBColor(5, 150, 105)

    set_notes(s18,
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, đây là bảng số liệu đo lường thực nghiệm thực tế chạy trực tiếp trên hệ thống của nhóm qua phương pháp Leave-One-Out trên 30 khách hàng:\n"
        "- Nhóm đã so sánh đối đầu giữa 3 phương pháp:\n"
        "  1. Thuật toán Phổ biến (Popularity) có độ phủ rất thấp chỉ 8.3%, khiến 110 sản phẩm khác trong kho hoàn toàn bị lãng quên (Superstar Bias).\n"
        "  2. Khi áp dụng Lọc cộng tác đồ thị (Graph CF), độ chính xác Recall tăng vọt lên 60% (tăng hơn 112%) và độ phủ đạt 56%.\n"
        "  3. Đặc biệt, Mô hình lai Hybrid Feed của nhóm đạt kết quả toàn diện nhất: Recall đạt đỉnh 63.3% (đoán trúng 6.3/10 khách), chỉ số xếp hạng NDCG đạt 0.506 (đưa sản phẩm mong muốn lên ngay vị trí Top 1 đến Top 3), độ phủ đạt 58% và thời gian phản hồi trung vị chỉ mất 41.1 mili-giây.\n"
        "- Kết quả thực nghiệm này khẳng định tính ưu việt vượt trội của giải pháp đồ thị lai do nhóm đề xuất."
    )

    # ==========================================
    # SLIDE 19: ĐO LƯỜNG HIỆU NĂNG THỰC TẾ (EXPLAIN & PROFILE)
    # ==========================================
    set_notes(prs.slides[18],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Để chứng minh câu lệnh Cypher được tối ưu triệt để, nhóm đã chạy công cụ PROFILE và EXPLAIN trực tiếp trên Neo4j Browser:\n"
        "- Toán tử gốc là NodeIndexSeek giúp truy xuất địa chỉ vật lý của nút khách hàng trong O(1) nhờ ràng buộc duy nhất customerId.\n"
        "- Toàn bộ hành trình duyệt đồ thị 2 bước nhảy qua hàng trăm quan hệ chỉ tiêu tốn đúng 386 DbHits và cấp phát 328 Bytes bộ nhớ.\n"
        "- Thời gian thực thi sau khi warm-up bộ nhớ đệm chỉ dưới 15 mili-giây, nhanh hơn gấp 10 lần so với ngưỡng tiêu chuẩn 200 mili-giây của các hệ thống E-commerce tải cao."
    )

    # ==========================================
    # SLIDE 20: PHÂN TÍCH CHỈ SỐ TÀI NGUYÊN
    # ==========================================
    set_notes(prs.slides[19],
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Thầy Cô có thể thấy 5 chỉ số tài nguyên trọng yếu:\n"
        "  + 386 DbHits cho toàn bộ hành trình 2 bước nhảy.\n"
        "  + 328 Bytes bộ nhớ cấp phát, tối ưu RAM tuyệt đối.\n"
        "  + Toán tử gốc NodeIndexSeek truy xuất O(1).\n"
        "  + Thời gian chạy lần đầu ~108ms và giảm xuống dưới 15ms khi có cache.\n"
        "  + Đạt chuẩn Real-Time E-commerce (< 200ms)."
    )

    # ==========================================
    # SLIDE 21: ĐỒ THỊ LIÊN KẾT THỰC TẾ (35 QUAN HỆ)
    # ==========================================
    s21 = prs.slides[20]
    for sh in s21.shapes:
        if sh.has_text_frame and "35 Quan Hệ BOUGHT" in sh.text_frame.text:
            sh.text_frame.text = "Cụm Trích Mẫu 35 Quan Hệ BOUGHT Trên Neo4j"
    set_notes(s21,
        "KỊCH BẢN THUYẾT TRÌNH (40 giây):\n"
        "- Trên màn hình là hình ảnh trực quan hóa cụm trích mẫu 35 quan hệ BOUGHT giữa 6 khách hàng và 17 sản phẩm trên Neo4j Browser.\n"
        "- Thầy Cô có thể thấy các dòng Laptop Dell và Lenovo đóng vai trò là 'Hubs' mua chung trung tâm nối các nhóm khách hàng lại với nhau.\n"
        "- (Lưu ý: Toàn bộ CSDL của nhóm hiện có quy mô thực tế là 150 sản phẩm, 65 khách hàng và hơn 900 quan hệ đồ thị)."
    )

    # ==========================================
    # SLIDE 22: PHÂN TÍCH 3 CHIỀU MINH BẠCH (BẢNG SO SÁNH)
    # ==========================================
    set_notes(prs.slides[21],
        "KỊCH BẢN THUYẾT TRÌNH (45 giây):\n"
        "- Thưa Thầy Cô, nhóm DT13 luôn duy trì tính tự đánh giá minh bạch giữa lý thuyết mong muốn và thực tế code triển khai:\n"
        "- Ví dụ: Thuật toán User-CF trên lý thuyết dùng Cosine/Pearson toàn ma trận, nhưng trong code nhóm duyệt tam giác sharedCount bằng Cypher để tối ưu cho đồ thị và dễ giải thích trực quan.\n"
        "- Về phân tích tiếng Việt: Thay vì gọi API LLM tốn kém và có độ trễ, nhóm dùng bộ Regex v2.0 tốc độ dưới 5ms, 0 chi phí.\n"
        "- Về phiên làm việc: Hiện tại dùng MemoryStore, và nhóm đã vạch rõ lộ trình nâng cấp lên Redis khi scale cụm microservices."
    )

    # ==========================================
    # SLIDE 23: KẾT LUẬN - ĐỐI CHIẾU BAREM 10.0
    # ==========================================
    s23 = prs.slides[22]
    # Update text from 120 Products, 60 Customers to 150 Products, 65 Customers
    for sh in s23.shapes:
        if sh.has_text_frame and "120 Products" in sh.text_frame.text:
            sh.text_frame.text = "150 Products (>100), 65 Customers (>50), >900 quan hệ BOUGHT/VIEWED."
        if sh.has_text_frame and "386 DbHits, thời gian chạy 108ms" in sh.text_frame.text:
            sh.text_frame.text = "EXPLAIN/PROFILE chi tiết, 386 DbHits, <15ms sau warm-up cache, kèm Offline Evaluation."
    set_notes(s23,
        "KỊCH BẢN THUYẾT TRÌNH (35 giây):\n"
        "- Đối chiếu với barem chấm điểm của học phần, nhóm DT13 đã hoàn thành toàn diện và vượt mức yêu cầu ở tất cả các hạng mục:\n"
        "- Từ mô hình đồ thị chuẩn hóa, quy mô dữ liệu thật 150 sản phẩm,\n"
        "- Đến hệ thống giải thuật đa dạng từ User-CF, Đa hành vi đến Serendipity và Động cơ lai 7 tầng,\n"
        "- Kèm theo phân tích hiệu năng EXPLAIN/PROFILE và ứng dụng web hoàn chỉnh có thể tương tác trực tiếp.\n"
        "- Nhóm tự tin đồ án đạt chuẩn chất lượng xuất sắc 10/10."
    )

    # ==========================================
    # SLIDE 24: HƯỚNG PHÁT TRIỂN TƯƠNG LAI
    # ==========================================
    set_notes(prs.slides[23],
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Về định hướng tương lai, nhóm đề xuất 4 giải pháp mở rộng:\n"
        "1. Tích hợp Mạng nơ-ron đồ thị (Graph Neural Networks - Node2Vec, GraphSAGE) để học biểu diễn vector nhúng sâu.\n"
        "2. Kết nối Apache Kafka xử lý luồng sự kiện click chuột thời gian thực.\n"
        "3. Áp dụng Học tăng cường (Reinforcement Learning) để tự động điều chỉnh trọng số động theo phản hồi người dùng.\n"
        "4. Và triển khai Redis Session phân tán để sẵn sàng phục vụ quy mô cụm máy chủ lớn."
    )

    # ==========================================
    # SLIDE 25: LỜI CẢM ƠN & CHUYỂN TIẾP LIVE DEMO
    # ==========================================
    set_notes(prs.slides[24],
        "KỊCH BẢN THUYẾT TRÌNH (30 giây):\n"
        "- Em xin chân thành cảm ơn TS. Trần Quang Bình đã tận tình định hướng cho nhóm trong suốt học phần, và cảm ơn Quý Thầy Cô trong Hội đồng đã chú ý lắng nghe.\n"
        "- Sau đây, nhóm DT13 xin trân trọng kính mời Thầy Cô cùng theo dõi phần Live Demo trực tiếp hệ thống trên trình duyệt.\n"
        "- Nhóm em đã sẵn sàng trả lời các câu hỏi phản biện từ Thầy Cô!"
    )

    prs.save(out_pptx)
    print(f"Successfully generated merged complete presentation at: {out_pptx}")
    print(f"Total slides: {len(prs.slides)}")

if __name__ == '__main__':
    merge_presentations()
