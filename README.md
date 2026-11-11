# Picozaca – Quản lý quán ăn vặt

Trang web quản lý quán đồ ăn vặt, chạy hoàn toàn trên trình duyệt (không cần máy chủ, không cần cài đặt).

## Tính năng

- **Bán hàng**: chạm món để lên đơn, thanh toán là tự trừ kho theo công thức.
- **Kho**: theo dõi tồn kho nguyên liệu, nhập hàng, kiểm kê, cảnh báo sắp hết / hết hàng.
- **Thực đơn & giá vốn**: khai báo công thức từng món, tự tính giá vốn, lãi mỗi phần và tỷ lệ lãi.
- **Thu chi**: xem theo ngày, tuần, tháng, năm kèm biểu đồ; ghi thêm các khoản chi khác (mặt bằng, điện nước, lương…).
- **Báo cáo**: món bán nhiều nhất / ít nhất, doanh thu cao nhất / thấp nhất, lọc riêng đồ ăn và thức uống.
- **Sao lưu**: tải file sao lưu và khôi phục ở mục Cài đặt (⚙️).

## Lưu ý về dữ liệu

Dữ liệu được lưu trong trình duyệt của thiết bị đang dùng (localStorage), không đồng bộ giữa các máy.
Hãy tải bản sao lưu thường xuyên ở mục Cài đặt.

## Chạy trên máy

Mở file `index.html` bằng trình duyệt, hoặc:

```bash
python -m http.server 5173
```

rồi vào http://localhost:5173

## Đưa lên mạng miễn phí (GitHub Pages)

1. Đẩy mã nguồn lên một repository công khai trên GitHub.
2. Vào **Settings → Pages**, mục **Source** chọn **Deploy from a branch**, chọn nhánh `main`, thư mục `/ (root)` rồi bấm **Save**.
3. Sau khoảng 1 phút trang sẽ có ở địa chỉ `https://<tên-tài-khoản>.github.io/<tên-repo>/`.
