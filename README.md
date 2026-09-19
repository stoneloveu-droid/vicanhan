# Ví của tôi — Sổ tài chính cá nhân

Giao diện Aurora với 5 tab: Tổng quan, Nợ, Thu chi, Công cụ, Cài đặt.

## Chạy thử
- `npm run preview:demo`: http://127.0.0.1:4173 — dữ liệu mẫu trong bộ nhớ, không gọi Firebase.
- `npm run preview`: giao diện dùng Firebase hiện tại.
- `npm test`: kiểm thử logic.
- `node tests/smoke.cjs`: cần bản demo đang chạy, Playwright và Microsoft Edge. Có thể đặt `PLAYWRIGHT_MODULE_PATH`.

## Số dư và ngân sách
- **Tiền hiện có:** tổng số dư từng ví/tài khoản. Mỗi tài khoản lấy lần cập nhật số dư gần nhất, cộng khoản thu, trừ khoản chi và tính chuyển tiền sau lần cập nhật đó.
- **Cần giữ lại:** dự chi chưa thanh toán cộng nợ còn phải trả trong tháng.
- **Có thể chi thêm:** tiền hiện có trừ số cần giữ lại. Số âm biểu thị thiếu ngân sách. Thu nhập chưa nhận không được tính là tiền có thể tiêu.
- **Giao dịch:** bắt buộc chọn tài khoản và ngày đã phát sinh. Chuyển tiền có tài khoản gửi/nhận, không cộng vào thu–chi.
- **Kế hoạch tháng:** nút Nhận tiền / Thanh toán tạo giao dịch liên kết. Cho phép thanh toán từng phần; phần còn lại tiếp tục được giữ trong ngân sách. Khoản phát sinh không làm giảm dự chi khác. Khi ghi giao dịch thủ công, chọn kế hoạch tương ứng để tránh giữ ngân sách hai lần.
- **Nợ:** xác nhận thanh toán yêu cầu tài khoản, tạo khoản chi và cập nhật kỳ vay trong cùng lần lưu. Hoàn tác hoặc xóa giao dịch trả nợ phục hồi cả tiền và kỳ vay. Chỉ xác nhận kỳ đầy đủ theo số tiền của khoản nợ; không tự tăng kỳ khi đổi tháng.
- **Tiết kiệm:** ghi chú riêng, không tác động số dư hoặc tạo khoản chi.
- **Cập nhật số dư:** bấm tài khoản để nhập số dư thực tế khi cần đối chiếu. Giữ lịch sử cập nhật. Các giao dịch đã ghi đến ngày cập nhật nằm trong số dư đó; giao dịch mới cùng ngày vẫn tiếp tục được cộng/trừ. Sửa lần cập nhật cũ trong Lịch sử để sửa sai số liệu.
- **Tháng trước:** số dư tính đến cuối tháng đã chọn từ lịch sử. Tháng tương lai dùng số dư hiện tại với kế hoạch tháng đó. Các ngày thu chi ở tương lai không được ghi nhận là đã phát sinh.
- Số dư phụ thuộc giao dịch và lần đối chiếu người dùng nhập; ứng dụng không kết nối tài khoản ngân hàng.

## Dữ liệu cũ
- Giữ dữ liệu tại `users/{uid}`, mở rộng bản ghi hiện có; không xóa giao dịch cũ.
- Giao dịch cũ chưa chọn tài khoản vẫn có trong thống kê thu–chi. Tổng quan thông báo cần bổ sung tài khoản; không tự đoán nguồn tiền.
- Các lần cập nhật số dư dùng `accountId` ổn định và danh sách giao dịch đã nằm trong số dư. Tên + loại được dùng để nhận diện các tài khoản từ bản cũ.
- `walletBase` cũ hiển thị thành “Số dư ban đầu”, không gán ngày giả.
- Khoản tiết kiệm tự tạo trước đây (`sv-txn-`, `isSaving: true`) vẫn được lưu nhưng không tính chi; có thể đổi phân loại khi chỉnh sửa.
- Tick nợ cũ vẫn được đọc, không tự tạo thêm giao dịch để tránh trừ trùng.
- Kế hoạch mặc định cũ áp dụng cho tháng chưa lập kế hoạch; thay đổi kế hoạch chỉ thuộc tháng đang chọn.
- JSON xuất đầy đủ dữ liệu. CSV có thông tin tài khoản và liên kết kế hoạch/nợ.

## Lưu dữ liệu và kiểm tra
Firestore transaction hợp nhất thay đổi độc lập; xung đột báo lỗi thay vì ghi đè. Lưu thất bại phục hồi dữ liệu và giữ biểu mẫu mở. Cần mạng để xác nhận lưu.

Kiểm thử dùng Firebase giả lập, không chạm dữ liệu thật: số dư qua nhiều tháng, dự chi từng phần, chuyển tiền, cập nhật số dư cùng ngày, thêm/sửa/xóa giao dịch, thanh toán/hoàn tác nợ, tiết kiệm, thiếu ngân sách và giao diện 320–430px. Đăng nhập Google và Firestore Rules cần kiểm chứng trên môi trường thật. Trang riêng `lich-doi.html` không thuộc thay đổi.
