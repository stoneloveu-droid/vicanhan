# Ví của tôi — Sổ tài chính cá nhân

Ứng dụng có 5 tab: Tổng quan, Nợ, Thu chi, Công cụ, Cài đặt.

## Quản lý và sử dụng

- **Cài đặt → Danh mục tài chính:** danh sách thu cố định, chi cố định, thẻ tín dụng và khoản vay. Thêm, sửa và dừng áp dụng tại đây. Khoản thu/chi có trường tháng bắt đầu; chỉ tính kế hoạch từ tháng đó.
- **Nợ:** xem chi tiết, đánh dấu đã trả hoặc hoàn tác. Không có thao tác xóa khoản nợ.
- **Thu chi → Thu chi cố định:** nhận tiền, thanh toán hoặc hoàn tác giao dịch kế hoạch gần nhất. Thu chi phát sinh được ghi riêng.
- **Ngừng theo dõi khoản nợ:** lưu mốc hiệu lực theo tháng, giữ thông tin khoản nợ và toàn bộ lịch sử. Có thể theo dõi lại trong Cài đặt.
- **Dừng khoản cố định:** áp dụng từ tháng đang chọn hoặc chỉ riêng tháng đó; các giao dịch đã ghi vẫn còn.

## Cách tính

- Card chính là ngân sách riêng từng tháng. Ví cộng dồn nằm ở card riêng và giữ lịch sử đã nhập.
- Cập nhật số dư và xem lịch sử ở card Ví cộng dồn. Khoản thu/chi tiếp theo được tính từ mốc đối chiếu.
- Còn phải chi gồm nợ chưa trả và khoản chi dự kiến chưa thanh toán. Trả hết nợ không loại bỏ tiền nhà hoặc các chi phí còn chờ.
- Dư tháng dự kiến = đã thu + dự thu còn lại − đã chi − dự chi còn lại. Tick/hoàn tác không trừ kế hoạch hai lần.
- Khoản chi liên kết với nợ chỉ được dự tính một lần. Khi đọc dữ liệu, chỉ tự liên kết bản ghi trùng có mã phù hợp hoặc tên và số tiền khớp duy nhất; các trường hợp khác được liên kết trong Cài đặt.
- Nhấn trực tiếp vào “Còn phải chi” trên card chính để xem từng khoản nợ và chi dự kiến chưa thanh toán.
- Tiết kiệm là ghi chú riêng. Lịch sử chuyển tiền nội bộ vẫn được giữ; không tạo chuyển tiền mới.
- Thanh toán nợ ghi chi, cập nhật tài khoản và kỳ vay cùng một lần; hoàn tác khôi phục các thay đổi đó.

## Dữ liệu và đồng bộ

`data-schema.js` chuẩn hóa dữ liệu lưu trữ tại đầu vào. Dấu thanh toán được chuyển thành giao dịch có mã ổn định; ghi chú tiết kiệm được đưa về danh sách ghi chú. Chuẩn hóa lặp lại không sinh bản trùng, không tự gán tài khoản hoặc trừ lại số dư. Các màn hình chỉ dùng một mô hình giao dịch, không có phân loại theo phiên bản.

Kế hoạch cố định dùng mốc hiệu lực theo tháng; chỉnh sửa riêng không thay đổi các tháng trước. Firestore transaction hợp nhất thay đổi độc lập và phát hiện chỉnh sửa xung đột theo giá trị, không phụ thuộc thứ tự trường. Lưu thất bại phục hồi dữ liệu.

## Chạy và kiểm tra

- `npm run preview:demo`: localhost:4173, dữ liệu mẫu, không kết nối Firebase.
- `npm run preview`: dùng cấu hình Firebase của dự án.
- `npm test`: kiểm tra tính toán, chuẩn hóa, lịch sử và đồng bộ.
- `node tests/smoke.cjs`: giao dịch, tài khoản, nợ và giao diện.
- `node tests/monthly.cjs`: thu chi cố định và tổng hợp tháng.
- `node tests/management.cjs`: quản lý trong Cài đặt, ngừng/theo dõi lại, hoàn tác và chi tiết còn phải chi.

Kiểm thử trình duyệt cần máy chủ demo, Playwright và Microsoft Edge; có thể đặt `PLAYWRIGHT_MODULE_PATH`. Không dùng dữ liệu tài khoản thật để chạy kiểm thử.

## Ngân sách tháng, ví cộng dồn và tự động

Card chính tính riêng thu dự kiến trừ toàn bộ chi phí của tháng, không chuyển dư tháng trước. Ví là số tiền cộng dồn từ giao dịch và đối chiếu; không cộng dư tháng vào ví thêm lần nữa. Chênh lệch đối chiếu lưu riêng, không phân loại thu/chi.

Khoản thu/chi dùng ngày ghi nhận hằng tháng (mặc định ngày 1); nợ dùng ngày thanh toán. Ngày 31 được giới hạn đến cuối tháng. Tự động bắt đầu từ tháng kích hoạt, xử lý bù các kỳ đến hạn khi mở lại app và khi qua ngày mới. Không có tiến trình chạy trên máy chủ khi app đóng.

Giao dịch có mã ổn định để tránh tạo trùng. Khoản vay cập nhật số kỳ và dư nợ theo lịch; thanh toán thẻ ghi số tiền tháng đã nhập, không suy đoán phần gốc/lãi sao kê. Hoàn tác hoặc xóa khoản tự động được ghi nhớ cho tháng đó. Có thể tắt/bật trong Cài đặt. Ví là ước tính cho đến khi đối chiếu thực tế.

Thanh điều hướng cao 66px, nút Thu chi nổi ở giữa, cách đáy 4px hoặc khoảng an toàn thiết bị. `node tests/schedule.cjs` kiểm tra tự động, đối chiếu độc lập và vị trí thanh điều hướng.
