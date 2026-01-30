import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Download } from 'lucide-react';
import api from '../../services/api';

interface ImportLeadsDialogProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedLead {
  name: string;
  email: string;
  phone: string;
  company?: string;
  source?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function ImportLeadsDialog({ open, onClose, onImportComplete }: ImportLeadsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError(null);
    setImportResult(null);
    parseExcelFile(selectedFile);
  };

  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Map Excel columns to lead fields
        const leads: ParsedLead[] = jsonData.map((row: any) => ({
          name: row['Name'] || row['name'] || row['Full Name'] || row['full_name'] || row['Lead Name'] || '',
          email: row['Email'] || row['email'] || row['Email Address'] || row['email_address'] || '',
          phone: String(row['Phone'] || row['phone'] || row['Phone Number'] || row['phone_number'] || row['Mobile'] || ''),
          company: row['Company'] || row['company'] || row['Company Name'] || row['company_name'] || '',
          source: row['Source'] || row['source'] || row['Lead Source'] || row['lead_source'] || 'Excel Import'
        }));

        // Filter out empty rows
        const validLeads = leads.filter(lead => lead.name && (lead.email || lead.phone));
        
        if (validLeads.length === 0) {
          setParseError('No valid leads found. Make sure your Excel file has columns: Name, Email, Phone');
          setParsedLeads([]);
        } else {
          setParsedLeads(validLeads);
        }
      } catch (error) {
        console.error('Error parsing Excel:', error);
        setParseError('Failed to parse Excel file. Please check the file format.');
        setParsedLeads([]);
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
      setParsedLeads([]);
    };

    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    if (parsedLeads.length === 0) return;

    setImporting(true);
    const result: ImportResult = { success: 0, failed: 0, errors: [] };

    for (const lead of parsedLeads) {
      try {
        await api.post('/api/leads', {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          company: lead.company || '',
          source: lead.source || 'Excel Import'
        });
        result.success++;
      } catch (error: any) {
        result.failed++;
        const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
        result.errors.push(`${lead.name}: ${errorMessage}`);
      }
    }

    setImportResult(result);
    setImporting(false);

    if (result.success > 0) {
      onImportComplete();
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedLeads([]);
    setImportResult(null);
    setParseError(null);
    onClose();
  };

  const downloadTemplate = () => {
    const templateData = [
      { Name: 'John Doe', Email: 'john@example.com', Phone: '1234567890', Company: 'Acme Inc', Source: 'Website' },
      { Name: 'Jane Smith', Email: 'jane@example.com', Phone: '0987654321', Company: 'Tech Corp', Source: 'Referral' }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, 'leads_import_template.xlsx');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">Import Leads from Excel</h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Download Template */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="font-medium text-blue-900">Need a template?</p>
              <p className="text-sm text-blue-700">Download our Excel template with the correct format</p>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download Template
            </Button>
          </div>

          {/* File Upload */}
          <div>
            <Label className="mb-2 block">Upload Excel File</Label>
            <div 
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-10 w-10 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">{parsedLeads.length} leads found</p>
                  </div>
                </div>
              ) : (
                <div>
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Click to upload or drag and drop</p>
                  <p className="text-sm text-gray-400">Excel files (.xlsx, .xls) or CSV</p>
                </div>
              )}
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <p>{parseError}</p>
            </div>
          )}

          {/* Preview */}
          {parsedLeads.length > 0 && !importResult && (
            <div>
              <Label className="mb-2 block">Preview ({parsedLeads.length} leads)</Label>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Email</th>
                      <th className="px-4 py-2 text-left">Phone</th>
                      <th className="px-4 py-2 text-left">Company</th>
                      <th className="px-4 py-2 text-left">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedLeads.slice(0, 5).map((lead, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2">{lead.name}</td>
                        <td className="px-4 py-2">{lead.email}</td>
                        <td className="px-4 py-2">{lead.phone}</td>
                        <td className="px-4 py-2">{lead.company}</td>
                        <td className="px-4 py-2">{lead.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedLeads.length > 5 && (
                  <p className="px-4 py-2 text-gray-500 text-sm bg-gray-50">
                    ...and {parsedLeads.length - 5} more leads
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-medium text-lg">Import Complete</p>
                  <p className="text-gray-600">
                    {importResult.success} leads imported successfully
                    {importResult.failed > 0 && `, ${importResult.failed} failed`}
                  </p>
                </div>
              </div>
              
              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="font-medium text-red-700 mb-2">Errors:</p>
                  <ul className="text-sm text-red-600 list-disc list-inside">
                    {importResult.errors.slice(0, 5).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li>...and {importResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
          <Button variant="outline" onClick={handleClose}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button 
              onClick={handleImport} 
              disabled={parsedLeads.length === 0 || importing}
            >
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import {parsedLeads.length} Leads
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
