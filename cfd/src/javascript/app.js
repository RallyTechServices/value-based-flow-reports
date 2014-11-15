Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 5 },
    value_field: 'c_BenefitProductivityValue',
    group_field: 'State',
    model: 'PortfolioItem/EPIC',
    items: [
        {xtype:'container',itemId:'selector_box'},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._getAllowedValuesFor(this.group_field).then({
            scope: this,
            success: function(allowed_values){
                this.logger.log("Allowed Values for ", this.group_field, allowed_values);
                this._addChart(this.down('#display_box'), allowed_values);
            },
            failure: function(message) {
                this.down('#display_box').add({xtype:'container',html:'Error finding allowed values: ' + message});
            }
        });
    },
    _addChart: function(container, allowed_values){
        var project_oid = this.getContext().getProject().ObjectID;

        var start_date = Rally.util.DateTime.add(new Date(),"month",-2);
        var height = Ext.getBody().getHeight();
        
        if ( height > 20 ) {
            height = height - 20;
        }
        container.add({
            xtype:'rallychart',
            storeType:'Rally.data.lookback.SnapshotStore',
            calculatorType:'Rally.technicalservices.ValueCFDCalculator',
            calculatorConfig: {
                allowed_values: allowed_values,
                group_field: this.group_field,
                value_field: this.value_field,
                startDate: start_date
            },
            storeConfig: {
                filters:[                    
                    {property:'_TypeHierarchy',value: this.model},
                    {property:'_ProjectHierarchy', value: project_oid}
                ],
                fetch: [this.group_field,this.value_field],
                hydrate: [this.group_field]
            },
            chartConfig: {
                chart: {
                    zoomType: 'xy',
                    height: height
                },
                title: {
                    text: 'Cumulative Flow By Value'
                },
                xAxis: {
                    tickmarkPlacement: 'on',
                    tickInterval: 7,
                    title: {
                        text: ''
                    }
                },
                yAxis: [{title:{text: 'Value'}}],
                plotOptions: {
                    series: {
                        marker: { enabled: false },
                        stacking: 'normal'
                    }
                }
            }
        });
    },
    _getAllowedValuesFor: function(field_name){
        var deferred = Ext.create('Deft.Deferred');
        Rally.data.ModelFactory.getModel({
            scope: this,
            type:this.model,
            context: {
                workspace: this.getContext().getWorkspace()
            },
            success: function(model){
                var field = model.getField(this.group_field);
                field.getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var allowed_values = [];
                        Ext.Array.each(records, function(allowedValue) {
                           allowed_values.push(allowedValue.get('StringValue'));
                        });
                        
                        deferred.resolve(allowed_values);
                    }
                });
            },
            failure: function(message) {
                deferred.reject(message);
            }
        });
        
        return deferred.promise;
    }
});