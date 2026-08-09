import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Modal } from '@/components/ui';

const meta: Meta<typeof Modal> = {
  component: Modal,
  title: 'Components/LegacyModal',
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Whether the modal is open',
    },
    title: {
      control: 'text',
      description: 'Modal title',
    },
    onClose: {
      action: 'closed',
      description: 'Close button click handler',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  args: {
    isOpen: true,
    title: 'Modal Title',
    children: (
      <div>
        <p className="mb-4">This is the modal content area.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Confirm</Button>
        </div>
      </div>
    ),
  },
};

export const BodyOnly: Story = {
  args: {
    isOpen: true,
    hideFooter: true,
    title: 'Body-only Modal',
    children: <p>Modal content without the default action footer.</p>,
  },
};

export const LongContent: Story = {
  args: {
    isOpen: true,
    title: 'Long-content Modal',
    children: (
      <div>
        <p className="mb-4">This is a large modal with more content.</p>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Section 1</h3>
            <p>Additional content here</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Section 2</h3>
            <p>More content</p>
          </div>
        </div>
      </div>
    ),
  },
};

export const NoTitle: Story = {
  args: {
    isOpen: true,
    title: '',
    children: <p>Modal without a title</p>,
  },
};

export const CustomFooter: Story = {
  args: {
    isOpen: true,
    title: 'Modal with a custom footer',
    children: <p className="mb-4">The footer can be replaced with workflow-specific actions.</p>,
    footer: <Button variant="primary">Continue</Button>,
  },
};

export const InteractiveDemo: Story = {
  args: {
    isOpen: true,
    title: 'Interactive Modal Demo',
    children: (
      <div>
        <p className="mb-4">
          This interactive story demonstrates:
        </p>
        <ul className="list-disc ml-6 mb-4 space-y-2">
          <li>Use the Controls panel to toggle isOpen prop</li>
          <li>Click the X button to trigger onClose action</li>
          <li>Try custom body and footer content</li>
          <li>Modify the title in the Controls panel</li>
        </ul>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary">Cancel</Button>
          <Button variant="primary">Confirm</Button>
        </div>
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive demonstration of modal functionality. Use the Controls panel to modify props and test interactions.',
      },
    },
  },
};
