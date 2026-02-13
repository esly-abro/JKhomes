import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  HelpCircle, 
  Phone, 
  Mail, 
  MessageSquare, 
  FileText, 
  Users, 
  Home, 
  Calendar,
  BarChart3,
  Settings,
  Search,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useOrganization } from '../hooks/useOrganization';
import { useTenantConfig } from '../context/TenantConfigContext';

interface FAQItem {
  question: string;
  answer: string;
}

interface GuideItem {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const faqs: FAQItem[] = [];

const guides: GuideItem[] = [];

export default function Help() {
  const { catalogModuleLabel } = useOrganization();
  const { appointmentFieldLabel } = useTenantConfig();
  const catalogLabel = catalogModuleLabel.toLowerCase();

  const dynamicFaqs: FAQItem[] = [
  {
    question: 'How do I add a new lead?',
    answer: `Click the "+" button in the header and select "Add Lead", or go to the Leads page and click the "Add Lead" button. Fill in the lead details including name, phone, email, and interested ${catalogLabel}.`
  },
  {
    question: 'How do I assign leads to agents?',
    answer: `Go to the Leads page, select one or more leads using the checkboxes, then click the "Assign" button. You can choose a specific agent or use auto-assign to distribute leads based on workload and ${catalogLabel} expertise.`
  },
  {
    question: `How do I schedule an ${appointmentFieldLabel.toLowerCase()}?`,
    answer: `Open a lead's detail page and click "Schedule ${appointmentFieldLabel}", or go to the Calendar page and create a new event. Select the lead, ${catalogLabel}, date, and time for the ${appointmentFieldLabel.toLowerCase()}.`
  },
  {
    question: 'How do I import leads from Excel?',
    answer: 'Click the "+" button and select "Import", or go to Leads page and click "Import". Upload your Excel file (.xlsx) with columns for Name, Email, Phone, Company, and Source.'
  },
  {
    question: 'How do I track lead status and activities?',
    answer: `Each lead has a status (New, Call Attended, No Response, Not Interested, ${appointmentFieldLabel} Booked, ${appointmentFieldLabel} Scheduled, Interested) and activity history. View activities on the Activities page or in individual lead details. Update status from the lead detail page.`
  },
  {
    question: 'How do I view analytics and reports?',
    answer: `Go to the Analytics page from the sidebar to view conversion rates, lead sources, agent performance, and ${catalogLabel} interest trends. Export reports using the download button.`
  },
  {
    question: 'How do I configure Twilio for calls?',
    answer: 'Go to Settings > Integrations tab. Configure your Twilio Account SID, Auth Token, and phone number. Enable Click-to-Call and Call Recording as needed.'
  },
  {
    question: `How do I add new ${catalogLabel}?`,
    answer: `Go to the ${catalogModuleLabel} page and click "Add ${catalogModuleLabel}". Enter details including name, location, type, price range, and other relevant information. ${catalogModuleLabel} will be available for lead assignment.`
  },
  ];

  const dynamicGuides: GuideItem[] = [
  {
    title: 'Managing Leads',
    description: 'Learn how to add, edit, assign, and track leads through the sales pipeline.',
    icon: <Users className="h-6 w-6 text-blue-600" />
  },
  {
    title: catalogModuleLabel,
    description: `Add and manage your ${catalogLabel} listings, including details, pricing, and availability.`,
    icon: <Home className="h-6 w-6 text-green-600" />
  },
  {
    title: `${appointmentFieldLabel}s & Calendar`,
    description: `Schedule and manage ${appointmentFieldLabel.toLowerCase()}s, follow-ups, and other calendar events.`,
    icon: <Calendar className="h-6 w-6 text-orange-600" />
  },
  {
    title: 'Analytics & Reports',
    description: 'View dashboards, track KPIs, and generate reports on sales performance.',
    icon: <BarChart3 className="h-6 w-6 text-purple-600" />
  },
  {
    title: 'Team Management',
    description: 'Add team members, set roles and permissions, and manage agent assignments.',
    icon: <Settings className="h-6 w-6 text-gray-600" />
  },
  {
    title: 'Telephony Integration',
    description: 'Configure Twilio for click-to-call, call logging, and IVR.',
    icon: <Phone className="h-6 w-6 text-teal-600" />
  },
  ];
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <HelpCircle className="h-8 w-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Help & Support</h1>
        <p className="text-gray-600 mt-2">
          Everything you need to know about using your CRM
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-xl mx-auto">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search for help topics..."
          className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Quick Guides */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Guides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dynamicGuides.map((guide, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 p-2 bg-gray-50 rounded-lg">
                    {guide.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{guide.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{guide.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {dynamicFaqs.map((faq, index) => (
              <details key={index} className="group">
                <summary className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50">
                  <span className="font-medium text-gray-900">{faq.question}</span>
                  <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-6 pb-4 text-gray-600">
                  {faq.answer}
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Contact Support */}
      <Card>
        <CardHeader>
          <CardTitle>Need More Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="p-3 bg-blue-100 rounded-full">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Call Us</p>
                <p className="text-sm text-gray-600">+91 80 4567 8900</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="p-3 bg-green-100 rounded-full">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Email Support</p>
                <p className="text-sm text-gray-600">support@yourcompany.com</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="p-3 bg-purple-100 rounded-full">
                <MessageSquare className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Live Chat</p>
                <p className="text-sm text-gray-600">Available 9 AM - 6 PM</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle>Keyboard Shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Search leads</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">Ctrl</kbd>
                <span className="text-gray-400">+</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">K</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Add new lead</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">Ctrl</kbd>
                <span className="text-gray-400">+</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">N</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Go to Dashboard</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">G</kbd>
                <span className="text-gray-400">then</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">D</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Go to Leads</span>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">G</kbd>
                <span className="text-gray-400">then</span>
                <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono">L</kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
