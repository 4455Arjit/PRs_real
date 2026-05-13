import tkinter as tk
from tkinter import ttk, messagebox
from datetime import date
import excel_handler
import macrotrigger
class InvoiceApp:
    def __init__(self, root):
        self.root = root
        self.root.title("E-Syndicates Invoice Manager")
        self.root.geometry("850x600")
        self.root.resizable(True, True)
 
        self.item_rows = []  # each entry = one dict of widgets per item row
 
        self.build_header_section()
        self.build_items_section()
        self.build_buttons()
 
    # ─────────────────────────────────────────────
    # SECTION 1 — Static fields at the top
    # ─────────────────────────────────────────────
    def build_header_section(self):
        header_frame = tk.LabelFrame(self.root, text="Invoice Details", padx=10, pady=10)
        header_frame.pack(fill="x", padx=10, pady=5)
 
        # Row 0 — Invoice # and Date
        tk.Label(header_frame, text="Invoice #").grid(row=0, column=0, sticky="w")
        self.invoice_number = tk.Entry(header_frame, width=15)
        self.invoice_number.grid(row=0, column=1, padx=5, pady=3)
        self.invoice_number.insert(0, str(excel_handler.get_next_invoice_number()))
 
        tk.Label(header_frame, text="Date").grid(row=0, column=2, sticky="w", padx=(20, 0))
        self.date_entry = tk.Entry(header_frame, width=15)
        self.date_entry.grid(row=0, column=3, padx=5, pady=3)
        self.date_entry.insert(0, str(date.today()))
 
        # Row 1 — Company Name (wide)
        tk.Label(header_frame, text="Company Name").grid(row=1, column=0, sticky="w")
        self.company_name = tk.Entry(header_frame, width=50)
        self.company_name.grid(row=1, column=1, columnspan=3, padx=5, pady=3, sticky="w")
 
        # Row 2 — Category dropdown and Party GSTIN
        tk.Label(header_frame, text="Category").grid(row=2, column=0, sticky="w")
        self.salesman = ttk.Combobox(
            header_frame,
            values=["RETAIL", "State", "IS_S",'CASH','Higher'],
            state="readonly",
            width=12
        )
        self.salesman.set("RETAIL")
        self.salesman.grid(row=2, column=1, padx=5, pady=3)
 
        tk.Label(header_frame, text="Party GSTIN").grid(row=2, column=2, sticky="w", padx=(20, 0))
        self.po_no = tk.Entry(header_frame, width=25)
        self.po_no.grid(row=2, column=3, padx=5, pady=3)
 
        # Row 3 — Shipping
        tk.Label(header_frame, text="Shipping").grid(row=3, column=0, sticky="w")
        self.shipping = tk.Entry(header_frame, width=15)
        self.shipping.grid(row=3, column=1, padx=5, pady=3)
        self.shipping.insert(0, "INDIA")
 
    # ─────────────────────────────────────────────
    # SECTION 2 — Dynamic items table
    # ─────────────────────────────────────────────
    def build_items_section(self):
        items_frame = tk.LabelFrame(self.root, text="Items", padx=10, pady=10)
        items_frame.pack(fill="both", expand=True, padx=10, pady=5)

        # --- NEW: separate header frame so it stays fixed ---
        header_frame = tk.Frame(items_frame)   # <-- added
        header_frame.grid(row=0, column=0, columnspan=5, sticky="ew")   # <-- added

        headers = ["Item Code", "Description", "Item Price", "Amount", ""]
        for col, h in enumerate(headers):
            tk.Label(header_frame, text=h, anchor="w",   # <-- changed: use header_frame instead of scrollable_frame
                     font=("Arial", 9, "bold")).grid(row=0, column=col, padx=3, pady=(0,4))

        # Canvas + scrollbar for scrollable item rows
        self.canvas = tk.Canvas(items_frame, height=200)
        scrollbar = ttk.Scrollbar(items_frame, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        # --- CHANGED: canvas now starts at row=1 (headers are row=0) ---
        self.canvas.grid(row=1, column=0, columnspan=5, sticky="nsew")   # <-- changed
        scrollbar.grid(row=1, column=5, sticky="ns")   # <-- changed

        items_frame.grid_rowconfigure(1, weight=1)
        items_frame.grid_columnconfigure(0, weight=1)

        # Start with one blank item row
        self.add_item_row()

        # Add Item button
        tk.Button(items_frame, text="+ Add Item", command=self.add_item_row)\
            .grid(row=2, column=0, pady=8, sticky="w")

 
    def add_item_row(self):
        row_index = len(self.item_rows)+1
 
        item_code   = tk.Entry(self.scrollable_frame, width=10)
        description = tk.Entry(self.scrollable_frame, width=35)
        item_price  = tk.Entry(self.scrollable_frame, width=12)
        amount      = tk.Entry(self.scrollable_frame, width=12)
 
        # row_widgets defined before remove_btn so the lambda can reference it
        row_widgets = {
            "item_code":   item_code,
            "description": description,
            "item_price":  item_price,
            "amount":      amount,
        }
 
        remove_btn = tk.Button(
            self.scrollable_frame, text="✕", fg="red",
            command=lambda rw=row_widgets: self.remove_item_row(rw)
        )
        row_widgets["remove_btn"] = remove_btn
 
        item_code.grid  (row=row_index, column=0, padx=3, pady=2)
        description.grid(row=row_index, column=1, padx=3, pady=2)
        item_price.grid (row=row_index, column=2, padx=3, pady=2)
        amount.grid     (row=row_index, column=3, padx=3, pady=2)
        remove_btn.grid (row=row_index, column=4, padx=3, pady=2)
 
        self.item_rows.append(row_widgets)
 
    def remove_item_row(self, row_widgets):
        if len(self.item_rows) == 1:
            messagebox.showwarning("Warning", "At least one item is required.")
            return
        for widget in row_widgets.values():
            widget.destroy()
        self.item_rows.remove(row_widgets)
 
    # ─────────────────────────────────────────────
    # SECTION 3 — Collect, validate, save
    # ─────────────────────────────────────────────
    def collect_data(self):
        items = []
        for i, row in enumerate(self.item_rows):
            item_code   = row["item_code"].get().strip()
            description = row["description"].get().strip()
            item_price  = row["item_price"].get().strip()
            amount      = row["amount"].get().strip()
 
            if not all([item_code, description, item_price, amount]):
                messagebox.showerror("Missing Data", f"Item row {i+1} is incomplete.")
                return None
 
            try:
                items.append({
                    "item_code":   int(item_code),
                    "description": description,
                    "item_price":  float(item_price),
                    "amount":      float(amount)
                })
            except ValueError:
                messagebox.showerror("Invalid Input", f"Item price / amount in row {i+1} must be numbers.")
                return None
 
        company = self.company_name.get().strip()
        if not company:
            messagebox.showerror("Missing Data", "Company Name is required.")
            return None
 
        return {
            "invoice_number": int(self.invoice_number.get()),
            "date":           self.date_entry.get(),
            "company_name":   company,
            "salesman":       self.salesman.get(),
            "po_no":          self.po_no.get().strip().upper(),
            "shipping":       self.shipping.get().strip() or "INDIA",
            "items":          items
        }
 
    def save_invoice(self):
        data = self.collect_data()
        if data is None:
            return
        excel_handler.save_invoice(data)
        macrotrigger.save_to_xlsm(data)
        self.root.lift()
        self.root.focus_force()
        messagebox.showinfo("Saved", f"Invoice #{data['invoice_number']} saved successfully!")
        self.reset_form()
 
    def reset_form(self):
        # Refresh invoice number to next one
        self.invoice_number.delete(0, tk.END)
        self.invoice_number.insert(0, str(excel_handler.get_next_invoice_number()))
 
        # Reset date to today
        self.date_entry.delete(0, tk.END)
        self.date_entry.insert(0, str(date.today()))
 
        # Clear header fields
        self.company_name.delete(0, tk.END)
        self.salesman.set("RETAIL")
        self.po_no.delete(0, tk.END)
        self.shipping.delete(0, tk.END)
        self.shipping.insert(0, "INDIA")
 
        # Destroy all item rows and start fresh with one blank row
        for row in self.item_rows:
            for widget in row.values():
                widget.destroy()
        self.item_rows = []
        self.add_item_row()
 
    # ─────────────────────────────────────────────
    # SECTION 4 — Bottom buttons
    # ─────────────────────────────────────────────
    def build_buttons(self):
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(fill="x", padx=10, pady=8)
 
        tk.Button(
            btn_frame, text="Save Invoice",
            bg="#4CAF50", fg="white", width=18,
            command=self.save_invoice
        ).pack(side="left", padx=5)
 
        tk.Button(
            btn_frame, text="Print Invoice",
            bg="#2196F3", fg="white", width=18,
            command=self.print_invoice
        ).pack(side="left", padx=5)
 
    def print_invoice(self):
        # Phase 5 — macro_trigger.py wires here
        macrotrigger.print_xlsm()
 
 
# ─────────────────────────────────────────────
# Entry point : in main.py file
# ─────────────────────────────────────────────
# if __name__ == "__main__":
#     root = tk.Tk()
#     app = InvoiceApp(root)
#     root.mainloop()