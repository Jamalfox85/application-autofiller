// Side-effect import only. ExtPay's module registers a window message listener
// that forwards the payment-page signal to the service worker. That listener is
// what makes extpay.onPaid fire. Do not call ExtPay() here.
import 'extpay'
