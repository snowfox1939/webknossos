// @flow
import React from "react";
import { Form, Row, Col, Button, Input, Select } from "antd";
import { getUsers, getProjects, getTaskTypes } from "admin/admin_rest_api";
import type { APIUserType, APIProjectType, APITaskTypeType } from "admin/api_flow_types";

const FormItem = Form.Item;
const Option = Select.Option;

type Props = {
  form: Object,
  onChange: Function,
};

type State = {
  users: Array<APIUserType>,
  projects: Array<APIProjectType>,
  taskTypes: Array<APITaskTypeType>,
};

class TaskSearchForm extends React.Component<Props, State> {
  state = {
    users: [],
    projects: [],
    taskTypes: [],
  };

  componentDidMount() {
    this.fetchData();
  }

  async fetchData() {
    this.setState({
      users: await getUsers(),
      projects: await getProjects(),
      taskTypes: await getTaskTypes(),
    });
  }

  handleFormSubmit = (event: SyntheticInputEvent<*>) => {
    event.preventDefault();

    this.props.form.validateFields((err, formValues) => {
      let queryObject = {};

      if (formValues.taskId) {
        const taskIds = formValues.taskId
          .trim()
          .replace(/,?\s+,?/g, ",") // replace remaining whitespaces with commata
          .split(",")
          .filter((taskId: string) => taskId.length > 0)
          .map((taskId: string) => ({
            $oid: taskId,
          }));

        if (taskIds.length === 1) {
          queryObject._id = taskIds[0];
        } else {
          queryObject._id = { $in: taskIds };
        }
      }

      if (formValues.taskTypeId) {
        queryObject._taskType = { $oid: formValues.taskTypeId };
      }

      if (formValues.userId) {
        queryObject._user = { $oid: formValues.userId };
      }

      if (formValues.projectName) {
        queryObject._project = formValues.projectName;
      }

      this.props.onChange(queryObject);
    });
  };

  handleReset = () => {
    this.props.form.resetFields();
  };

  render() {
    const { getFieldDecorator } = this.props.form;
    const formItemLayout = {
      labelCol: { span: 5 },
      wrapperCol: { span: 19 },
    };

    return (
      <Form onSubmit={this.handleFormSubmit}>
        <Row gutter={40}>
          <Col span={12}>
            <FormItem {...formItemLayout} label="Task Id">
              {getFieldDecorator("taskId")(<Input placeholder="One or More Task IDs" />)}
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem {...formItemLayout} label="Task Type">
              {getFieldDecorator("taskTypeId")(
                <Select
                  showSearch
                  placeholder="Select a Task Type"
                  optionFilterProp="children"
                  style={{ width: "100%" }}
                >
                  {this.state.taskTypes.map((taskType: APITaskTypeType) => (
                    <Option key={taskType.id} value={taskType.id}>
                      {`${taskType.summary}`}
                    </Option>
                  ))}
                </Select>,
              )}
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem {...formItemLayout} label="Project">
              {getFieldDecorator("projectName")(
                <Select
                  showSearch
                  placeholder="Select a Project"
                  optionFilterProp="children"
                  style={{ width: "100%" }}
                >
                  {this.state.projects.map((project: APIProjectType) => (
                    <Option key={project.id} value={project.name}>
                      {`${project.name}`}
                    </Option>
                  ))}
                </Select>,
              )}
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem {...formItemLayout} label="User">
              {getFieldDecorator("userId")(
                <Select
                  showSearch
                  placeholder="Select a User"
                  optionFilterProp="children"
                  style={{ width: "100%" }}
                >
                  {this.state.users.filter(u => u.isActive).map((user: APIUserType) => (
                    <Option key={user.id} value={user.id}>
                      {`${user.lastName}, ${user.firstName} ${user.email}`}
                    </Option>
                  ))}
                </Select>,
              )}
            </FormItem>
          </Col>
        </Row>
        <Row>
          <Col span={24} style={{ textAlign: "right" }}>
            <Button type="primary" htmlType="submit">
              Search
            </Button>
            <Button style={{ marginLeft: 8 }} onClick={this.handleReset}>
              Clear
            </Button>
          </Col>
        </Row>
      </Form>
    );
  }
}

export default Form.create()(TaskSearchForm);
