# Ví của tôi — Sổ tài chính cá nhân

Giao diện Aurora với 5 tab: Tổng quan, Nợ, Thu chi, Công cụ, Cài đặt.

## Chạy và kiểm tra
- `npm run preview:demo`: http://127.0.0.1:4173 — dữ liệu mẫu, không gọi Firebase.
- `npm run preview`: dùng cấu hình Firebase hiện tại.
- `npm test`: kiểm thử số dư, nợ, dự chi, lặp lại và lịch sử.
- `node tests/smoke.cjs`: kiểm tra thao tác và giao diện 320–430px.
- `node tests/monthly.cjs`: kiểm tra thu chi cố định, thanh toán hết, hoàn tác và dữ liệu cũ.
- Hai kiểm thử trình duyệt cần máy chủ demo, Playwright và Microsoft Edge; có thể đặt `PLAYWRIGHT_MODULE_PATH`.

## Một cách tính thống nhất
- **Tiền hiện có:** số dư gần nhất của từng tài khoản cộng/trừ các giao dịch sau lần cập nhật. Chuyển tiền chỉ đổi nơi giữ tiền.
- **Dự chi cả tháng:** các khoản chi theo kế hoạch cộng các kỳ nợ trong tháng. Khoản chi liên kết với tab Nợ không được cộng lần thứ hai.
- **Dự chi đã trả:** phần kế hoạch đã thanh toán, cộng nợ đã trả. Thanh toán từng phần chỉ giảm đúng phần đã trả.
- **Còn phải chi:** dự chi cả tháng trừ dự chi đã trả. Trả hết nợ chỉ còn chi sinh hoạt chưa thanh toán; trả hết cả hai thì về 0.
- **Đã chi:** toàn bộ chi thực tế, gồm khoản theo kế hoạch, trả nợ và chi phát sinh. Có thể cao hơn dự chi khi chi vượt kế hoạch.
- **Có thể chi thêm:** tiền hiện có trừ còn phải chi. Số âm được hiển thị để nhận biết thiếu ngân sách. Dự thu chưa nhận không được coi là tiền có thể tiêu.
- Tổng quan, danh sách Thu chi, biểu đồ, phân tích và báo cáo dùng cùng dữ liệu tổng hợp. Phân tích trình bày số liệu thực tế và dự kiến, không tự chấm điểm sức khỏe tài chính.

## Thu chi cố định
Trong Thu chi → Thu chi cố định, mỗi khoản có phạm vi:
- **Hằng tháng, từ tháng đang chọn:** lặp lại từ tháng này trở đi; lịch sử tháng trước được giữ nguyên.
- **Chỉ tháng đang chọn:** thêm/sửa/xóa riêng tháng này.

Thay đổi cố định được chuyển tiếp qua các phiên bản tương lai chưa chỉnh riêng chính khoản đó. Chỉnh riêng một khoản của tháng không chặn các khoản cố định khác. Xóa khoản cố định dừng lặp từ tháng đang chọn. Các giao dịch đã phát sinh vẫn được giữ.

Nhận tiền / Thanh toán tạo giao dịch gắn kế hoạch và tài khoản. Khoản đã hoàn tất có thể mở giao dịch để sửa hoặc xóa. Khi khoản chi đã được quản lý trong tab Nợ, liên kết khoản nợ tương ứng để tránh trùng dự chi; số tiền theo tab Nợ.

## Nợ, tài khoản và tiết kiệm
- Tick nợ chọn tài khoản lần đầu, sau đó nhớ tài khoản để tick/bỏ tick trực tiếp. Lưu khoản chi và cập nhật kỳ vay cùng một lần; hoàn tác phục hồi cả hai. Đổi tài khoản qua Chi tiết thanh toán.
- Lịch thanh toán loại nợ đã trả, dùng tháng đang chọn và ngày đến hạn thực tế (ngày 31 được giới hạn đến cuối tháng).
- Cập nhật số dư thực tế giữ lịch sử. Giao dịch đã ghi đến ngày cập nhật nằm trong số dư đó; giao dịch mới cùng ngày tiếp tục được cộng/trừ.
- Tiết kiệm là ghi chú riêng, không tự tạo khoản chi hay thay đổi số dư.
- Ứng dụng không kết nối ngân hàng. Số dư phụ thuộc giao dịch và lần đối chiếu người dùng nhập.

## Tương thích dữ liệu
- Giữ cấu trúc `users/{uid}`; thêm `recurringPlans` theo tháng bắt đầu áp dụng. `monthlyPlans` mới lưu phần chỉnh riêng và danh sách bỏ qua; vẫn đọc các bản kế hoạch đầy đủ từ phiên bản cũ.
- `income`/`expense` cũ là mẫu cố định ban đầu. Không xóa dữ liệu cũ.
- Giao dịch chưa chọn tài khoản vẫn có trong thống kê và có thông báo để bổ sung.
- Tick nợ cũ chưa có giao dịch được tổng hợp vào Đã chi/biểu đồ/báo cáo đúng một lần, không tự trừ số dư tài khoản lần nữa. Người dùng đối chiếu số dư khi cần.
- Khoản tiết kiệm tự tạo trước đây (`sv-txn-`, `isSaving: true`) được giữ nhưng không tính chi cho đến khi người dùng đổi phân loại.
- Xóa khoản nợ không làm khoản chi liên kết tự trở thành một khoản dự chi mới.
- JSON giữ đầy đủ dữ liệu. CSV xuất kế hoạch đã kết hợp theo từng tháng, phiên bản khoản cố định, nguồn tiền và khoản trả nợ cũ.

## Lưu dữ liệu
Firestore transaction hợp nhất thay đổi độc lập; xung đột báo lỗi. Lưu thất bại phục hồi dữ liệu và giữ biểu mẫu mở. Cần mạng để xác nhận lưu.

Kiểm thử dùng dữ liệu giả lập, không chạm dữ liệu thật. Đăng nhập Google và Firestore Rules cần kiểm chứng trong môi trường triển khai. Trang riêng `lich-doi.html` không thuộc thay đổi.
