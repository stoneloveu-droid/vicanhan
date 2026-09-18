# Ví của tôi — Aurora

Ứng dụng tài chính cá nhân ưu tiên điện thoại. Giữ 5 tab: Tổng quan, Nợ, Thu chi, Công cụ, Cài đặt.

## Chạy thử
- `npm run preview:demo`: http://127.0.0.1:4173 — dữ liệu mẫu trong bộ nhớ, không gọi Firebase.
- `npm run preview`: giao diện dùng Firebase hiện tại.
- `npm test`: kiểm tra tính tiền, lịch trả nợ, hợp nhất dữ liệu và xử lý nội dung.
- `node tests/smoke.cjs`: kiểm thử trình duyệt; cần bản demo đang chạy, Playwright và Microsoft Edge. Đường dẫn Playwright dùng runtime trên máy phát triển này.

## Giao diện
Aurora dùng nền tối, gradient, điều hướng nổi, phản hồi chạm, chuyển cảnh và bảng nhập có thể kéo xuống để đóng. Vuốt ngang vùng trống chuyển tab. Giữ tùy chọn sáng/tối và màu chủ đạo. Chuyển động tôn trọng thiết lập giảm chuyển động của hệ điều hành và có công tắc riêng.

## Quy ước số liệu
- Số dư theo kế hoạch = số dư đầu kỳ + thu cố định + giao dịch thu − chi cố định − giao dịch chi − nợ đã thanh toán.
- Có thể chi tiêu = số dư theo kế hoạch − phần nợ chưa thanh toán.
- Thu/chi cố định là kế hoạch tháng, không phải giao dịch ngân hàng được xác minh.
- Các tháng dùng chung số dư nền và cấu hình thu/chi cố định hiện tại. Chưa phải sổ cái có kết chuyển hoặc lưu cấu hình lịch sử từng tháng.
- Xác nhận thanh toán ở tháng hiện tại tăng kỳ vay và ghi lại số tiền kỳ đó; hoàn tác khôi phục kỳ trước. Chuyển tháng không tự tăng kỳ.
- Tick cũ dạng boolean vẫn đọc được; không đoán lại các khoản tiền lịch sử chưa từng được lưu.
- Lãi suất nhập theo %/năm. Không tự nhân 12 chỉ vì mức lãi thấp.
- Tất toán sớm hiện là đánh dấu trạng thái; người dùng ghi khoản chi thực tế riêng.
- Khoản góp quỹ có giao dịch chi liên kết; chỉnh/xóa từ Công cụ để tránh lệch số liệu.

## Lưu dữ liệu
Giữ cấu trúc tài liệu `users/{uid}` và các trường cũ. Mỗi thao tác ghi dùng Firestore transaction và hợp nhất thay đổi theo bản ghi. Nếu hai thiết bị sửa xung đột, hủy lần ghi và thông báo tải lại; không âm thầm ghi đè. Lỗi lưu giữ biểu mẫu mở, phục hồi state và không báo thành công. Cần mạng để xác nhận lưu.

Đăng nhập Google từ ví khách dùng liên kết tài khoản giữ UID. Nếu Google đã thuộc tài khoản khác, ứng dụng giữ ví khách và hướng dẫn xuất dữ liệu trước khi chuyển.

## Phạm vi kiểm tra
Kiểm thử chạy bằng Firebase giả lập trong bộ nhớ, không sử dụng tài khoản hay dữ liệu thật. Cần kiểm tra đăng nhập Google và Firestore Rules trên môi trường triển khai thực tế. Chưa triển khai lên hosting hoặc store. `lich-doi.html` là trang riêng, không thay đổi trong đợt này.
