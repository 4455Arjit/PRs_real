import win32com.client
import os
XLSM_PATH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'assets','esyndicates.xlsm')
def save_to_xlsm(invoice_data):
    excel=win32com.client.Dispatch('Excel.Application') #starts Excel as a background process that Python can control
    excel.Visible=True
    wb=None
    excel.DisplayAlerts = False
    excel.AskToUpdateLinks=False
    for workbook in excel.Workbooks:
        if workbook.FullName.lower()==XLSM_PATH.lower():
            wb=workbook
            break
    if wb is None:
        wb=excel.Workbooks.Open(XLSM_PATH)
    ws=wb.Sheets('Invoice')
    ws.Range("B13:E29").ClearContents()
    ws.Range('E2').Value=str(invoice_data['date'])  #Date input -> E2
    ws.Range('E4').Value = invoice_data['shipping']
    ws.Range('C9').Value=invoice_data['po_no']  #Party GSTIN(po_no) -> C9 
    ws.Range('C10').Value='Sales/Service Invoice' #Notfy: hardcoded Sales/Service Invoice[On C10 ]
    ws.Range('E10').Value=invoice_data['salesman']  #Salesmen: options[Retail,IS_S,state,Cash,Higher]: on E10
    ws.Range('B3').Value=invoice_data['company_name']
    for i, item in enumerate(invoice_data["items"]): #the Item Columns will increment their respective number upto 28th row only .eg:B13 to B28 , C13 to C28 ,D13 to D28, E13 to E28 <- one thing in common the number are same so only one variable is required
        row = 13 + i          # starts at B13, then B14, B15...
        ws.Range(f"B{row}").Value = item["item_code"]  #Item columns=[Item Code/qty: B13 , Description : C13, Item Value:D13 , Amount:E13 ] : Only 15 rows to fill will be limited inside every Invoice sheet
        ws.Range(f"C{row}").Value = item["description"]
        ws.Range(f"D{row}").Value = item["item_price"]
        ws.Range(f"E{row}").Value = item["amount"]
    excel.DisplayAlerts = False
    ws.Range('C7').Value=invoice_data['invoice_number']#Invoice no input->C7
    excel.Application.Run("INV")
    wb.Save() #lastly -> Click on 'Save Invoice' button on right side (can't get the hang of the column name cuz its above the columns and column name is unnecessary here-can't use it cuz of Visual Basic element i guess)-> so i automated it
    wb.Close()
    excel.Quit()


def print_xlsm():
    excel=win32com.client.Dispatch('Excel.Application')
    excel.Visible=True
    excel.DisplayAlerts=False
    excel.AskToUpdateLinks=False
    wb=None
    for workbook in excel.Workbooks:
        if workbook.Fullname.lower()==XLSM_PATH.lower():
            wb=workbook
            break
    if wb is None:
        wb=excel.Workbooks.Open(XLSM_PATH)
    wb.Sheets('Invoice').Activate()
    import excel_handler
    last_invoice=excel_handler.get_next_invoice_number()-1
    wb.Sheets('Invoice').Range('C7').Value=int(last_invoice)
    excel.Application.Run("Sel")

    #Print Invoice button (directly get the previous Invoice page thats going to be printed